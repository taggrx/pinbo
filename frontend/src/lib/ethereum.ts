import { writable, get } from 'svelte/store';
import {
	createPublicClient,
	createWalletClient,
	custom,
	http,
	parseAbiItem,
	hexToBytes,
	bytesToHex,
	decodeEventLog,
} from 'viem';
import { mainnet } from 'viem/chains';
import { pinboChain } from './chains';
import { pinboContractAddress, pinboAbi } from './contract';
import pako from 'pako';

// Types
type EthereumProvider = any; // TODO: better type

// Store for connected account
export const account = writable<`0x${string}` | null>(null);
export const isConnected = writable(false);
export const error = writable<string | null>(null);

const STORAGE_KEY = 'pinbo_account';

// ENS resolution cache
const ensCache = new Map<string, string | null>();

function getEnsClient() {
	const ensRpc = import.meta.env.VITE_ENS_RPC || 'https://1.rpc.thirdweb.com';
	return createPublicClient({
		chain: mainnet,
		transport: http(ensRpc),
	});
}

export async function resolveEns(address: `0x${string}`): Promise<string | null> {
	if (ensCache.has(address)) {
		return ensCache.get(address) || null;
	}
	try {
		const ensName = await getEnsClient().getEnsName({ address });
		ensCache.set(address, ensName || null);
		return ensName;
	} catch {
		ensCache.set(address, null);
		return null;
	}
}

// Public client (read-only)
function getPublicClient() {
	const rpcUrl = import.meta.env.VITE_LOCAL_RPC_URL || 'http://localhost:8545';
	return createPublicClient({
		chain: pinboChain,
		transport: http(rpcUrl),
	});
}

// Get current fee from contract
export async function getFee(): Promise<bigint> {
	const fee = await getPublicClient().readContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'fee',
		args: [],
	});
	return fee as bigint;
}

// Get latest message block from contract
export async function getLatestMessageBlock(): Promise<bigint> {
	console.log('[Paging] getLatestMessageBlock: calling contract');
	try {
		const block = await getPublicClient().readContract({
			address: pinboContractAddress,
			abi: pinboAbi,
			functionName: 'latestMessageBlock',
			args: [],
		});
		console.log('[Paging] getLatestMessageBlock: result =', block);
		return block as bigint;
	} catch (e) {
		console.error('[Paging] getLatestMessageBlock: error =', e);
		throw e;
	}
}

// Get contract deployment block from environment
const CONTRACT_DEPLOY_BLOCK = import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK
	? BigInt(import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK)
	: 0n;

// Page size in blocks for log fetching (most RPCs can handle ~1000 blocks per request)
const PAGE_SIZE = 1000n;

// Fetch logs in a specific block range (inclusive)
async function fetchLogsInRange(fromBlock: bigint, toBlock: bigint): Promise<any[]> {
	if (fromBlock > toBlock) {
		// Swap to ensure fromBlock <= toBlock
		[fromBlock, toBlock] = [toBlock, fromBlock];
	}
	console.log('[Paging] getLogs from', fromBlock, 'to', toBlock);
	try {
		const logs = await getPublicClient().getLogs({
			address: pinboContractAddress,
			event: parseAbiItem(
				'event MessagePosted(address indexed sender, bytes message, uint256 timestamp)'
			),
			fromBlock,
			toBlock,
		});
		console.log('[Paging] getLogs: got', logs.length, 'logs');
		// Transform logs (decompress)
		const messages = logs.map((log) => {
			const messageHex = log.args.message as `0x${string}`;
			const data = hexToBytes(messageHex);
			const storedSize = data.length;
			let decompressed: string;
			try {
				decompressed = pako.inflate(data, { to: 'string' });
			} catch {
				decompressed = new TextDecoder().decode(data);
			}
			const decompressedSize = new TextEncoder().encode(decompressed).length;
			if (storedSize < decompressedSize) {
				const ratio = ((1 - storedSize / decompressedSize) * 100).toFixed(1);
				console.log(
					`[Compression] decompressed ${decompressedSize}B -> ${storedSize}B stored (${ratio}% reduction)`
				);
			} else {
				console.log(`[Compression] stored uncompressed`);
			}
			return {
				sender: log.args.sender as `0x${string}`,
				message: decompressed,
				timestamp: Number(log.args.timestamp) * 1000, // convert to ms
				blockNumber: log.blockNumber,
				txHash: log.transactionHash,
			};
		});
		// Sort by timestamp descending (newest first)
		messages.sort((a, b) => b.timestamp - a.timestamp);
		return messages;
	} catch (e) {
		console.error('[Paging] getLogs: error =', e);
		throw e;
	}
}

// Create a message loader with pagination state
export function createMessageLoader() {
	let oldestBlockQueried: bigint | null = null;
	let latestBlockQueried: bigint | null = null;

	async function loadInitialStreaming(
		targetCount = 50,
		onPage?: (pageMessages: any[]) => void
	): Promise<{ messages: any[]; hasMore: boolean }> {
		console.log('[Paging] loadInitialStreaming: starting');
		const latestBlock = await getLatestMessageBlock();
		console.log('[Paging] latestMessageBlock:', latestBlock);
		const startBlock = latestBlock > 0n ? latestBlock : await getPublicClient().getBlockNumber();
		console.log('[Paging] startBlock:', startBlock);
		const deployBlock = CONTRACT_DEPLOY_BLOCK;
		console.log('[Paging] deployBlock:', deployBlock);

		let currentFromBlock = startBlock;
		const collected: any[] = [];

		while (collected.length < targetCount && currentFromBlock > deployBlock) {
			console.log('[Paging] fetching from', currentFromBlock - PAGE_SIZE, 'to', currentFromBlock);
			const pageToBlock = currentFromBlock;
			const pageFromBlock =
				currentFromBlock - PAGE_SIZE > deployBlock ? currentFromBlock - PAGE_SIZE : deployBlock;

			const pageMessages = await fetchLogsInRange(pageFromBlock, pageToBlock);
			console.log('[Paging] got', pageMessages.length, 'messages in this page');
			// Append because we're going from newest to oldest blocks
			collected.push(...pageMessages);
			if (onPage) {
				// Call onPage with messages sorted newest first (they already are)
				onPage([...pageMessages]);
			}

			currentFromBlock = pageFromBlock - 1n;
			console.log('[Paging] total collected:', collected.length);
			if (pageFromBlock === deployBlock) {
				break;
			}
		}

		// Sort collected by timestamp descending (newest first)
		collected.sort((a, b) => b.timestamp - a.timestamp);

		oldestBlockQueried = currentFromBlock;
		latestBlockQueried = startBlock;
		console.log('[Paging] done. hasMore:', oldestBlockQueried > deployBlock);

		return {
			messages: collected,
			hasMore: oldestBlockQueried > deployBlock,
		};
	}

	async function loadMore(targetCount = 50): Promise<{ messages: any[]; hasMore: boolean }> {
		if (!oldestBlockQueried) {
			throw new Error('Must call loadInitial first');
		}
		const deployBlock = CONTRACT_DEPLOY_BLOCK;
		if (oldestBlockQueried <= deployBlock) {
			return { messages: [], hasMore: false };
		}

		let currentFromBlock = oldestBlockQueried;
		const collected: any[] = [];

		while (collected.length < targetCount && currentFromBlock > deployBlock) {
			const pageToBlock = currentFromBlock;
			const pageFromBlock =
				currentFromBlock - PAGE_SIZE > deployBlock ? currentFromBlock - PAGE_SIZE : deployBlock;

			const pageMessages = await fetchLogsInRange(pageFromBlock, pageToBlock);
			// Append because we're going from newest to oldest blocks
			collected.push(...pageMessages);

			currentFromBlock = pageFromBlock - 1n;
			if (pageFromBlock === deployBlock) {
				break;
			}
		}

		// Sort collected by timestamp descending (newest first)
		collected.sort((a, b) => b.timestamp - a.timestamp);

		oldestBlockQueried = currentFromBlock;

		return {
			messages: collected,
			hasMore: oldestBlockQueried > deployBlock,
		};
	}

	return {
		loadInitialStreaming,
		loadMore,
		getState: () => ({ oldestBlockQueried, latestBlockQueried }),
	};
}

// Wallet client (for sending transactions)
let walletClient: ReturnType<typeof createWalletClient> | null = null;

// Auto-connect on load
export async function autoConnect() {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return;

	try {
		if (typeof window === 'undefined' || !window.ethereum) return;
		const provider = window.ethereum as EthereumProvider;

		// Check if account is still available
		const accounts = await provider.request({ method: 'eth_accounts' });
		if (!accounts.includes(stored)) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}

		// Get chain ID from wallet
		const chainIdHex = await provider.request({ method: 'eth_chainId' });
		const chainId = parseInt(chainIdHex, 16);

		walletClient = createWalletClient({
			chain: {
				id: chainId,
				name: 'Unknown',
				nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
				rpcUrls: { default: { http: [] } },
			},
			transport: custom(provider),
		});
		account.set(stored as `0x${string}`);
		isConnected.set(true);
	} catch {
		localStorage.removeItem(STORAGE_KEY);
	}
}

// Initialize connection
export async function connect() {
	try {
		if (typeof window === 'undefined' || !window.ethereum) {
			throw new Error('MetaMask not installed');
		}
		const provider = window.ethereum as EthereumProvider;
		// Request account access
		const [address] = await provider.request({ method: 'eth_requestAccounts' });
		account.set(address);
		isConnected.set(true);
		error.set(null);
		localStorage.setItem(STORAGE_KEY, address);

		// Get chain ID from wallet
		const chainIdHex = await provider.request({ method: 'eth_chainId' });
		const chainId = parseInt(chainIdHex, 16);

		// Create wallet client with wallet's chain
		walletClient = createWalletClient({
			chain: {
				id: chainId,
				name: 'Unknown',
				nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
				rpcUrls: { default: { http: [] } },
			},
			transport: custom(provider),
		});

		return address;
	} catch (err: any) {
		error.set(err.message);
		throw err;
	}
}

// Disconnect
export function disconnect() {
	account.set(null);
	isConnected.set(false);
	walletClient = null;
	localStorage.removeItem(STORAGE_KEY);
}

// Post a message (compress with max compression, fallback to plain bytes if larger)
export async function postMessage(message: string) {
	if (!walletClient) {
		throw new Error('Not connected');
	}
	const currentAccount = get(account);
	if (!currentAccount) {
		throw new Error('No account');
	}

	// Get current fee
	const fee = await getFee();

	const originalBytes = new TextEncoder().encode(message);
	const compressed = pako.deflate(message, { level: 9 });

	const originalSize = originalBytes.length;
	const compressedSize = compressed.length;
	if (compressedSize < originalSize) {
		const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
		console.log(`[Compression] ${originalSize}B -> ${compressedSize}B (${ratio}% reduction)`);
	} else {
		console.log(`[Compression] skipped (no improvement)`);
	}

	let dataToStore: Uint8Array;
	if (compressedSize < originalSize) {
		dataToStore = compressed;
	} else {
		dataToStore = originalBytes;
	}

	const dataHex = bytesToHex(dataToStore);

	// Estimate gas using public client
	const publicClient = getPublicClient();
	const gas = await publicClient.estimateContractGas({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'postMessage',
		args: [dataHex],
		account: currentAccount,
		value: fee,
	});

	const hash = await walletClient.writeContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'postMessage',
		args: [dataHex],
		account: currentAccount,
		value: fee,
		gas: gas,
	});
	return hash;
}

// Subscribe to new messages
export function watchMessages(callback: (message: any) => void) {
	return getPublicClient().watchContractEvent({
		address: pinboContractAddress,
		abi: pinboAbi,
		eventName: 'MessagePosted',
		onLogs: (logs) => {
			logs.forEach((log) => {
				const messageHex = log.args.message as `0x${string}`;
				const data = hexToBytes(messageHex);
				let decompressed: string;
				try {
					decompressed = pako.inflate(data, { to: 'string' });
				} catch {
					decompressed = new TextDecoder().decode(data);
				}
				callback({
					sender: log.args.sender,
					message: decompressed,
					timestamp: Number(log.args.timestamp) * 1000,
					blockNumber: log.blockNumber,
					txHash: log.transactionHash,
				});
			});
		},
	});
}

// Wait for a transaction to be confirmed then return the message
export async function waitForMessage(txHash: `0x${string}`) {
	await getPublicClient().waitForTransactionReceipt({ hash: txHash });
	return getMessageByTxHash(txHash);
}

// Get message by transaction hash
export async function getMessageByTxHash(txHash: `0x${string}`) {
	const receipt = await getPublicClient().getTransactionReceipt({ hash: txHash });
	const log = receipt.logs.find(
		(l) => l.address.toLowerCase() === pinboContractAddress.toLowerCase()
	);
	if (!log) throw new Error('Message not found');

	// Get block to get timestamp
	const block = await getPublicClient().getBlock({ blockNumber: log.blockNumber });
	const timestamp = Number(block.timestamp) * 1000;

	// Decode log using viem
	const decoded = decodeEventLog({
		abi: pinboAbi,
		data: log.data,
		topics: log.topics,
	});

	const messageBytes = decoded.args.message as `0x${string}`;
	const data = hexToBytes(messageBytes);

	// Try decompression first, fallback to plain bytes
	let decompressed: string;
	try {
		decompressed = pako.inflate(data, { to: 'string' });
	} catch {
		decompressed = new TextDecoder().decode(data);
	}

	return {
		sender: decoded.args.sender as `0x${string}`,
		message: decompressed,
		timestamp,
		blockNumber: log.blockNumber,
		txHash: log.transactionHash,
	};
}
