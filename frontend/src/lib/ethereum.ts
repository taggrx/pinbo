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
import type { Message } from './types';
import pako from 'pako';
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';

const VERSION_BYTE = 0x01;

export const TOPIC_TYPE = {
	REPOST: 0,
	ADDRESS: 1,
} as const;

type Topics = Array<[number, Uint8Array]> | null;

function encodeMessage(text: string, topics: Topics = null): Uint8Array {
	const textBytes = new TextEncoder().encode(text);
	const compressed = pako.deflate(textBytes, { level: 9 });
	const messageBytes = compressed.length < textBytes.length ? compressed : textBytes;
	const packed = msgpackEncode(
		topics ? { message: messageBytes, topics } : { message: messageBytes }
	);
	const result = new Uint8Array(1 + packed.length);
	result[0] = VERSION_BYTE;
	result.set(packed, 1);
	return result;
}

function decodeMessage(data: Uint8Array): { message: string; topics: Topics } {
	if (data[0] === VERSION_BYTE) {
		const unpacked = msgpackDecode(data.slice(1)) as { message: Uint8Array; topics: Topics };
		let text: string;
		try {
			text = pako.inflate(unpacked.message, { to: 'string' });
		} catch {
			text = new TextDecoder().decode(unpacked.message);
		}
		return { message: text, topics: unpacked.topics ?? null };
	}
	// Legacy: plain bytes or pako-compressed text
	let text: string;
	try {
		text = pako.inflate(data, { to: 'string' });
	} catch {
		text = new TextDecoder().decode(data);
	}
	return { message: text, topics: null };
}

type EthereumProvider = any;

export const account = writable<`0x${string}` | null>(null);
export const isConnected = writable(false);
export const wrongNetwork = writable(false);

const STORAGE_KEY = 'pinbo_account';

const ensCache = new Map<string, string | null>();

export async function resolveEns(address: `0x${string}`): Promise<string | null> {
	const ensRpc = import.meta.env.VITE_ENS_RPC;
	if (!ensRpc) return null;
	if (ensCache.has(address)) return ensCache.get(address) || null;
	try {
		const client = createPublicClient({ chain: mainnet, transport: http(ensRpc) });
		const ensName = await client.getEnsName({ address });
		ensCache.set(address, ensName || null);
		return ensName;
	} catch {
		ensCache.set(address, null);
		return null;
	}
}

function getPublicClient() {
	return createPublicClient({
		chain: pinboChain,
		transport: http(import.meta.env.VITE_RPC_URL),
	});
}

export async function getFee(): Promise<bigint> {
	return (await getPublicClient().readContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'fee',
		args: [],
	})) as bigint;
}

async function getLatestMessageBlock(): Promise<bigint> {
	return (await getPublicClient().readContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'latestMessageBlock',
		args: [],
	})) as bigint;
}

const CONTRACT_DEPLOY_BLOCK = import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK
	? BigInt(import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK)
	: 0n;

const PAGE_SIZE = 1000n;

const MESSAGE_EVENT = parseAbiItem(
	'event MessagePosted(address indexed sender, bytes message, uint256 timestamp)'
);

function logToMessage(log: any): Message {
	const data = hexToBytes(log.args.message as `0x${string}`);
	const { message, topics } = decodeMessage(data);
	return {
		sender: log.args.sender as `0x${string}`,
		message,
		topics,
		timestamp: Number(log.args.timestamp) * 1000,
		blockNumber: log.blockNumber,
		txHash: log.transactionHash,
	};
}

async function fetchLogsInRange(
	fromBlock: bigint,
	toBlock: bigint,
	args?: Record<string, unknown>
): Promise<Message[]> {
	if (fromBlock > toBlock) [fromBlock, toBlock] = [toBlock, fromBlock];
	try {
		const logs = await getPublicClient().getLogs({
			address: pinboContractAddress,
			event: MESSAGE_EVENT,
			args,
			fromBlock,
			toBlock,
		});
		return logs.map(logToMessage).sort((a, b) => b.timestamp - a.timestamp);
	} catch (e) {
		console.error('fetchLogsInRange error:', e);
		throw e;
	}
}

async function fetchPages(
	startBlock: bigint,
	stopBlock: bigint,
	targetCount: number,
	args?: Record<string, unknown>,
	onPage?: (pageMessages: Message[]) => void
): Promise<{ messages: Message[]; nextBlock: bigint }> {
	let currentBlock = startBlock;
	const collected: Message[] = [];

	while (collected.length < targetCount && currentBlock > stopBlock) {
		const pageFrom = currentBlock - PAGE_SIZE > stopBlock ? currentBlock - PAGE_SIZE : stopBlock;
		const pageMessages = await fetchLogsInRange(pageFrom, currentBlock, args);
		collected.push(...pageMessages);
		onPage?.([...pageMessages]);
		currentBlock = pageFrom - 1n;
		if (pageFrom === stopBlock) break;
	}

	return { messages: collected.sort((a, b) => b.timestamp - a.timestamp), nextBlock: currentBlock };
}

export function createMessageLoader() {
	let oldestBlockQueried: bigint | null = null;
	let latestBlockQueried: bigint | null = null;

	async function loadInitialStreaming(
		targetCount = 50,
		onPage?: (pageMessages: Message[]) => void
	): Promise<{ messages: Message[]; hasMore: boolean }> {
		const latestBlock = await getLatestMessageBlock();
		const startBlock = latestBlock > 0n ? latestBlock : await getPublicClient().getBlockNumber();

		const { messages, nextBlock } = await fetchPages(startBlock, CONTRACT_DEPLOY_BLOCK, targetCount, undefined, onPage);
		oldestBlockQueried = nextBlock;
		latestBlockQueried = startBlock;

		return { messages, hasMore: oldestBlockQueried > CONTRACT_DEPLOY_BLOCK };
	}

	async function loadMore(targetCount = 50): Promise<{ messages: Message[]; hasMore: boolean }> {
		if (!oldestBlockQueried) throw new Error('Must call loadInitial first');
		if (oldestBlockQueried <= CONTRACT_DEPLOY_BLOCK) return { messages: [], hasMore: false };

		const { messages, nextBlock } = await fetchPages(oldestBlockQueried, CONTRACT_DEPLOY_BLOCK, targetCount);
		oldestBlockQueried = nextBlock;

		return { messages, hasMore: oldestBlockQueried > CONTRACT_DEPLOY_BLOCK };
	}

	return {
		loadInitialStreaming,
		loadMore,
		getState: () => ({ oldestBlockQueried, latestBlockQueried }),
	};
}

export async function getMessagesByAddress(address: `0x${string}`): Promise<Message[]> {
	const latestBlock = await getPublicClient().getBlockNumber();
	const { messages } = await fetchPages(latestBlock, CONTRACT_DEPLOY_BLOCK, Infinity, { sender: address });
	return messages;
}


let walletClient: ReturnType<typeof createWalletClient> | null = null;

function createWalletClientForChain(provider: EthereumProvider, chainId: number) {
	return createWalletClient({
		chain: {
			id: chainId,
			name: 'Unknown',
			nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
			rpcUrls: { default: { http: [] } },
		},
		transport: custom(provider),
	});
}

export async function autoConnect() {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return;
	try {
		if (typeof window === 'undefined' || !window.ethereum) return;
		const provider = window.ethereum as EthereumProvider;
		if (typeof provider.request !== 'function') return;

		const accounts = await provider.request({ method: 'eth_accounts' });
		if (!accounts.includes(stored)) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}

		const chainId = parseInt(await provider.request({ method: 'eth_chainId' }), 16);
		walletClient = createWalletClientForChain(provider, chainId);
		account.set(stored as `0x${string}`);
		isConnected.set(true);
		wrongNetwork.set(chainId !== pinboChain.id);
	} catch {
		localStorage.removeItem(STORAGE_KEY);
	}
}

export async function connect() {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('No wallet detected');
	}
	const provider = window.ethereum as EthereumProvider;
	if (typeof provider.request !== 'function') {
		throw new Error('Wallet does not support the required interface');
	}
	const [address] = await provider.request({ method: 'eth_requestAccounts' });
	account.set(address);
	isConnected.set(true);
	localStorage.setItem(STORAGE_KEY, address);

	const chainId = parseInt(await provider.request({ method: 'eth_chainId' }), 16);
	walletClient = createWalletClientForChain(provider, chainId);
	wrongNetwork.set(chainId !== pinboChain.id);

	return address;
}

export function disconnect() {
	account.set(null);
	isConnected.set(false);
	wrongNetwork.set(false);
	walletClient = null;
	localStorage.removeItem(STORAGE_KEY);
}

export async function postMessage(message: string, topics: Topics = null) {
	if (!walletClient) throw new Error('Not connected');
	const currentAccount = get(account);
	if (!currentAccount) throw new Error('No account');

	const fee = await getFee();
	const dataHex = bytesToHex(encodeMessage(message, topics));
	const publicClient = getPublicClient();

	const gas = await publicClient.estimateContractGas({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'postMessage',
		args: [dataHex],
		account: currentAccount,
		value: fee,
	});

	return walletClient.writeContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'postMessage',
		args: [dataHex],
		account: currentAccount,
		value: fee,
		gas,
	});
}

export function watchMessages(callback: (message: Message) => void) {
	return getPublicClient().watchContractEvent({
		address: pinboContractAddress,
		abi: pinboAbi,
		eventName: 'MessagePosted',
		onLogs: (logs) => logs.forEach((log) => callback(logToMessage(log))),
	});
}

export async function waitForMessage(txHash: `0x${string}`) {
	await getPublicClient().waitForTransactionReceipt({ hash: txHash });
	return getMessageByTxHash(txHash);
}

export async function getMessageByTxHash(txHash: `0x${string}`) {
	const receipt = await getPublicClient().getTransactionReceipt({ hash: txHash });
	const log = receipt.logs.find(
		(l) => l.address.toLowerCase() === pinboContractAddress.toLowerCase()
	);
	if (!log) throw new Error('Message not found');

	const block = await getPublicClient().getBlock({ blockNumber: log.blockNumber });
	const decoded = decodeEventLog({ abi: pinboAbi, data: log.data, topics: log.topics });
	const { message, topics } = decodeMessage(hexToBytes(decoded.args.message as `0x${string}`));

	return {
		sender: decoded.args.sender as `0x${string}`,
		message,
		topics,
		timestamp: Number(block.timestamp) * 1000,
		blockNumber: log.blockNumber,
		txHash: log.transactionHash,
	};
}
