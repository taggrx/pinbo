import { writable, get } from 'svelte/store';
import {
	createPublicClient,
	http,
	parseAbi,
	parseAbiItem,
	hexToBytes,
	bytesToHex,
	decodeEventLog,
	formatEther,
} from 'viem';
import { mainnet } from 'viem/chains';
import { watchAccount, getWalletClient, disconnect as wagmiDisconnect } from '@wagmi/core';
import { wagmiAdapter, appKitModal } from './wallet';
import { pinboChain } from './chains';
import { pinboContractAddress, pinboAbi } from './contract';
import type { Message } from './types';
import { idbSaveMessage, idbGetMessage, idbGetAllMessages, idbGetMeta, idbSetMeta, idbClear, idbGetEns, idbSetEns } from './idb';
import pako from 'pako';
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';

const VERSION_BYTE = 0x01;

export const TOPIC_TYPE = {
	REPOST: 0,
	ADDRESS: 1,
} as const;

type Topics = Array<[number, Uint8Array]> | null;

function encodeMessage(text: string, topics: Topics = null): Uint8Array {
	const textBytes = new TextEncoder().encode(text.trim());
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

function inflateOrDecode(bytes: Uint8Array): string {
	try {
		return pako.inflate(bytes, { to: 'string' });
	} catch {
		return new TextDecoder().decode(bytes);
	}
}

function decodeMessage(data: Uint8Array): { message: string; topics: Topics } {
	if (data[0] === VERSION_BYTE) {
		const unpacked = msgpackDecode(data.slice(1)) as { message: Uint8Array; topics: Topics };
		return { message: inflateOrDecode(unpacked.message), topics: unpacked.topics ?? null };
	}
	// Legacy: plain bytes or pako-compressed text
	return { message: inflateOrDecode(data), topics: null };
}

export const account = writable<`0x${string}` | null>(null);
export const isConnected = writable(false);
export const wrongNetwork = writable(false);

const ensCache = new Map<string, string | null>();
const ensAvatarCache = new Map<string, string | null>();
const ensNameInflight = new Map<string, Promise<string | null>>();
const ensAvatarInflight = new Map<string, Promise<string | null>>();

let ensClient: ReturnType<typeof createPublicClient> | null = null;

function getEnsClient() {
	if (ensClient) return ensClient;
	const ensRpc = import.meta.env.VITE_ENS_RPC;
	if (!ensRpc) return null;
	ensClient = createPublicClient({ chain: mainnet, transport: http(ensRpc, { batch: true }) });
	return ensClient;
}

export async function resolveEnsName(address: `0x${string}`): Promise<string | null> {
	const client = getEnsClient();
	if (!client) return null;
	if (ensCache.has(address)) return ensCache.get(address) ?? null;
	if (ensNameInflight.has(address)) return ensNameInflight.get(address)!;
	const promise = (async () => {
		try {
			const cached = await idbGetEns(`name:${address}`);
			if (cached !== undefined) { ensCache.set(address, cached); return cached; }
			const name = await client.getEnsName({ address }) ?? null;
			ensCache.set(address, name);
			idbSetEns(`name:${address}`, name).catch(() => {});
			return name;
		} catch {
			ensCache.set(address, null);
			return null;
		} finally {
			ensNameInflight.delete(address);
		}
	})();
	ensNameInflight.set(address, promise);
	return promise;
}

export async function resolveEnsAvatar(name: string): Promise<string | null> {
	const client = getEnsClient();
	if (!client) return null;
	if (ensAvatarCache.has(name)) return ensAvatarCache.get(name) ?? null;
	if (ensAvatarInflight.has(name)) return ensAvatarInflight.get(name)!;
	const promise = (async () => {
		try {
			const cached = await idbGetEns(`avatar:${name}`);
			if (cached !== undefined) { ensAvatarCache.set(name, cached); return cached; }
			const avatar = await client.getEnsAvatar({ name }) ?? null;
			ensAvatarCache.set(name, avatar);
			idbSetEns(`avatar:${name}`, avatar).catch(() => {});
			return avatar;
		} catch {
			ensAvatarCache.set(name, null);
			return null;
		} finally {
			ensAvatarInflight.delete(name);
		}
	})();
	ensAvatarInflight.set(name, promise);
	return promise;
}

const LS_RPC_KEY = 'pinbo_rpc';

export function getCustomRpc(): string | null {
	return localStorage.getItem(LS_RPC_KEY);
}

export function setCustomRpc(url: string | null) {
	if (url) {
		localStorage.setItem(LS_RPC_KEY, url);
	} else {
		localStorage.removeItem(LS_RPC_KEY);
	}
}

const publicClient = createPublicClient({
	chain: pinboChain,
	transport: http(localStorage.getItem(LS_RPC_KEY) || import.meta.env.VITE_RPC_URL),
});

function getPublicClient() {
	return publicClient;
}

const contractInfoAbi = parseAbi([
	'function name() view returns (string)',
	'function symbol() view returns (string)',
]);

export interface AddressInfo {
	isContract: boolean;
	balance: bigint;
	balanceEth: string;
	name: string | null;
	symbol: string | null;
}

export async function getAddressInfo(address: `0x${string}`): Promise<AddressInfo> {
	const client = getPublicClient();
	const [codeResult, balanceResult, nameResult, symbolResult] = await Promise.allSettled([
		client.getCode({ address }),
		client.getBalance({ address }),
		client.readContract({ address, abi: contractInfoAbi, functionName: 'name' }),
		client.readContract({ address, abi: contractInfoAbi, functionName: 'symbol' }),
	]);
	const code = codeResult.status === 'fulfilled' ? codeResult.value : undefined;
	const isContract = !!code && code !== '0x';
	const balance = balanceResult.status === 'fulfilled' ? balanceResult.value : 0n;
	return {
		isContract,
		balance,
		balanceEth: formatEther(balance),
		name: isContract && nameResult.status === 'fulfilled' ? nameResult.value as string : null,
		symbol: isContract && symbolResult.status === 'fulfilled' ? symbolResult.value as string : null,
	};
}

let feeCache: { value: bigint; ts: number } | null = null;
const FEE_TTL = 5 * 60 * 1000;

export async function getFee(): Promise<bigint> {
	if (feeCache && Date.now() - feeCache.ts < FEE_TTL) return feeCache.value;
	const value = (await getPublicClient().readContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'fee',
		args: [],
	})) as bigint;
	feeCache = { value, ts: Date.now() };
	return value;
}


const CONTRACT_DEPLOY_BLOCK = import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK
	? BigInt(import.meta.env.VITE_CONTRACT_DEPLOY_BLOCK)
	: 0n;

const PAGE_SIZE = 1000n;

async function getLatestMessageBlock(): Promise<bigint> {
	return (await getPublicClient().readContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'latestMessageBlock',
		args: [],
	})) as bigint;
}

let cachedLatestBlock: bigint = 0n;

export async function refreshLatestBlock(): Promise<void> {
	cachedLatestBlock = await getLatestMessageBlock();
}

const MESSAGE_EVENT = parseAbiItem(
	'event MessagePosted(address indexed sender, bytes message, uint256 timestamp)'
);

const messageCache = new Map<string, Message>();

function logToMessage(log: any): Message {
	const data = hexToBytes(log.args.message as `0x${string}`);
	const { message, topics } = decodeMessage(data);
	const msg: Message = {
		sender: log.args.sender as `0x${string}`,
		message,
		topics,
		timestamp: Number(log.args.timestamp) * 1000,
		blockNumber: log.blockNumber,
		txHash: log.transactionHash,
	};
	messageCache.set(msg.txHash, msg);
	idbSaveMessage(msg);
	return msg;
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
	let idbMsgs: Message[] = [];
	let idbOffset = 0;

	async function loadInitialStreaming(
		targetCount = 50,
		onPage?: (pageMessages: Message[]) => void
	): Promise<{ messages: Message[]; hasMore: boolean }> {
		const startBlock = cachedLatestBlock;

		// Serve IDB messages immediately for instant display
		let newestCachedBlock: bigint | null = null;
		let oldestCachedBlock: bigint | null = null;
		try {
			[idbMsgs, newestCachedBlock, oldestCachedBlock] = await Promise.all([
				idbGetAllMessages(),
				idbGetMeta('newestBlock').then(v => v !== null ? BigInt(v) : null),
				idbGetMeta('oldestBlock').then(v => v !== null ? BigInt(v) : null),
			]);
			if (idbMsgs.length > 0) {
				onPage?.(idbMsgs.slice(0, targetCount));
				idbOffset = Math.min(targetCount, idbMsgs.length);
			}
		} catch { /* IDB unavailable, fall through to RPC-only */ }

		// Fetch from RPC only the blocks newer than what's already cached
		const fetchStop = newestCachedBlock !== null ? newestCachedBlock + 1n : CONTRACT_DEPLOY_BLOCK;
		if (startBlock >= fetchStop) {
			const rpcTarget = newestCachedBlock !== null ? Infinity : targetCount;
			const { messages: _, nextBlock } = await fetchPages(startBlock, fetchStop, rpcTarget, undefined, onPage);
			try {
				await idbSetMeta('newestBlock', Number(startBlock));
				if (oldestCachedBlock === null) await idbSetMeta('oldestBlock', Number(nextBlock));
			} catch {}
			oldestBlockQueried = oldestCachedBlock ?? nextBlock;
		} else {
			oldestBlockQueried = oldestCachedBlock ?? startBlock;
		}

		latestBlockQueried = startBlock;
		return {
			messages: idbMsgs,
			hasMore: idbOffset < idbMsgs.length || (oldestBlockQueried ?? 0n) > CONTRACT_DEPLOY_BLOCK,
		};
	}

	async function loadMore(targetCount = 50): Promise<{ messages: Message[]; hasMore: boolean }> {
		// Serve remaining IDB messages before going to RPC
		if (idbOffset < idbMsgs.length) {
			const page = idbMsgs.slice(idbOffset, idbOffset + targetCount);
			idbOffset += page.length;
			return {
				messages: page,
				hasMore: idbOffset < idbMsgs.length || (oldestBlockQueried ?? 0n) > CONTRACT_DEPLOY_BLOCK,
			};
		}

		if (!oldestBlockQueried) throw new Error('Must call loadInitial first');
		if (oldestBlockQueried <= CONTRACT_DEPLOY_BLOCK) return { messages: [], hasMore: false };

		const { messages, nextBlock } = await fetchPages(oldestBlockQueried, CONTRACT_DEPLOY_BLOCK, targetCount);
		try { await idbSetMeta('oldestBlock', Number(nextBlock)); } catch {}
		oldestBlockQueried = nextBlock;
		return { messages, hasMore: oldestBlockQueried > CONTRACT_DEPLOY_BLOCK };
	}

	return {
		loadInitialStreaming,
		loadMore,
		getState: () => ({ oldestBlockQueried, latestBlockQueried }),
	};
}

export async function getInboxMessages(
	address: `0x${string}`,
	onPage?: (messages: Message[]) => void
): Promise<Message[]> {
	// Fast path: if the main feed has already scanned all blocks, filter IDB locally.
	// Falls back to RPC scan if cache is incomplete (e.g. first visit or after idbClear).
	try {
		const oldestBlock = await idbGetMeta('oldestBlock');
		if (oldestBlock !== null && BigInt(oldestBlock) <= CONTRACT_DEPLOY_BLOCK) {
			const all = await idbGetAllMessages();
			const filtered = all
				.filter((m) =>
					(m.topics ?? []).some(
						([type, bytes]) =>
							type === TOPIC_TYPE.ADDRESS &&
							bytesToHex(bytes as Uint8Array).toLowerCase() === address.toLowerCase()
					)
				)
				.sort((a, b) => b.timestamp - a.timestamp);
			onPage?.(filtered);
			return filtered;
		}
	} catch {}
	const client = getPublicClient();
	let currentBlock = cachedLatestBlock;
	const collected: Message[] = [];
	while (currentBlock > CONTRACT_DEPLOY_BLOCK) {
		const pageFrom = currentBlock - PAGE_SIZE > CONTRACT_DEPLOY_BLOCK ? currentBlock - PAGE_SIZE : CONTRACT_DEPLOY_BLOCK;
		const logs = await client.getLogs({
			address: pinboContractAddress,
			event: MESSAGE_EVENT,
			fromBlock: pageFrom,
			toBlock: currentBlock,
		});
		const filtered = logs
			.map(logToMessage)
			.filter((m) =>
				(m.topics ?? []).some(
					([type, bytes]) =>
						type === TOPIC_TYPE.ADDRESS &&
						bytesToHex(bytes as Uint8Array).toLowerCase() === address.toLowerCase()
				)
			)
			.sort((a, b) => b.timestamp - a.timestamp);
		if (filtered.length > 0) {
			collected.push(...filtered);
			onPage?.(filtered);
		}
		currentBlock = pageFrom - 1n;
		if (pageFrom === CONTRACT_DEPLOY_BLOCK) break;
	}
	return collected.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getMessagesByAddress(
	address: `0x${string}`,
	onPage?: (messages: Message[]) => void
): Promise<Message[]> {
	// Fast path: if the main feed has already scanned all blocks, filter IDB locally.
	// Falls back to RPC scan if cache is incomplete (e.g. first visit or after idbClear).
	try {
		const oldestBlock = await idbGetMeta('oldestBlock');
		if (oldestBlock !== null && BigInt(oldestBlock) <= CONTRACT_DEPLOY_BLOCK) {
			const all = await idbGetAllMessages();
			const filtered = all
				.filter((m) => m.sender.toLowerCase() === address.toLowerCase())
				.sort((a, b) => b.timestamp - a.timestamp);
			onPage?.(filtered);
			return filtered;
		}
	} catch {}
	const { messages } = await fetchPages(cachedLatestBlock, CONTRACT_DEPLOY_BLOCK, Infinity, { sender: address }, onPage);
	return messages;
}


export function initWallet() {
	return watchAccount(wagmiAdapter.wagmiConfig, {
		onChange(data) {
			if (data.isConnected && data.address) {
				account.set(data.address);
				isConnected.set(true);
				wrongNetwork.set(data.chain?.id !== pinboChain.id);
			} else {
				account.set(null);
				isConnected.set(false);
				wrongNetwork.set(false);
			}
		},
	});
}

export function connect() {
	appKitModal.open();
}

export function disconnect() {
	idbClear().catch(() => {});
	wagmiDisconnect(wagmiAdapter.wagmiConfig);
}

export async function postMessage(message: string, topics: Topics = null) {
	const currentAccount = get(account);
	if (!currentAccount) throw new Error('Not connected');

	const wc = await getWalletClient(wagmiAdapter.wagmiConfig);
	if (!wc) throw new Error('No wallet client');

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

	return wc.writeContract({
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
		pollingInterval: 60_000,
		onLogs: (logs) => logs.forEach((log) => callback(logToMessage(log))),
	});
}

export async function waitForMessage(txHash: `0x${string}`) {
	await getPublicClient().waitForTransactionReceipt({ hash: txHash });
	return getMessageByTxHash(txHash);
}

const messageByTxHashInflight = new Map<string, Promise<Message>>();

export async function getMessageByTxHash(txHash: `0x${string}`) {
	if (messageCache.has(txHash)) return messageCache.get(txHash)!;
	if (messageByTxHashInflight.has(txHash)) return messageByTxHashInflight.get(txHash)!;
	const promise = (async () => {
		try {
			const cached = await idbGetMessage(txHash);
			if (cached) { messageCache.set(txHash, cached); return cached; }
			const receipt = await getPublicClient().getTransactionReceipt({ hash: txHash });
			const log = receipt.logs.find(
				(l) => l.address.toLowerCase() === pinboContractAddress.toLowerCase()
			);
			if (!log) throw new Error('Message not found');
			const block = await getPublicClient().getBlock({ blockNumber: log.blockNumber });
			const decoded = decodeEventLog({ abi: pinboAbi, data: log.data, topics: log.topics });
			const { message, topics } = decodeMessage(hexToBytes(decoded.args.message as `0x${string}`));
			const msg: Message = {
				sender: decoded.args.sender as `0x${string}`,
				message,
				topics,
				timestamp: Number(block.timestamp) * 1000,
				blockNumber: log.blockNumber,
				txHash: log.transactionHash,
			};
			messageCache.set(txHash, msg);
			idbSaveMessage(msg);
			return msg;
		} finally {
			messageByTxHashInflight.delete(txHash);
		}
	})();
	messageByTxHashInflight.set(txHash, promise);
	return promise;
}
