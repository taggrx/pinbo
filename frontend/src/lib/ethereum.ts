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
import {
	watchAccount,
	getWalletClient,
	connect as wagmiConnect,
	disconnect as wagmiDisconnect,
} from '@wagmi/core';
import { injected } from '@wagmi/connectors';
import { wagmiAdapter, appKitModal } from './wallet';
import { pinboChain } from './chains';
import { pinboContractAddress, pinboAbi } from './contract';
import type { Message } from './types';
import {
	idbSaveMessage,
	idbGetMessage,
	idbGetAllMessages,
	idbGetMeta,
	idbSetMeta,
	idbClear,
	idbGetEns,
	idbSetEns,
} from './idb';
import pako from 'pako';
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';

const VERSION_BYTE = 0x01;

export const TOPIC_TYPE = {
	REPOST: 0,
	ADDRESS: 1,
} as const;

// Each topic is a [type, payload] tuple: type is TOPIC_TYPE.REPOST or TOPIC_TYPE.ADDRESS,
// payload is the referenced tx hash bytes or address bytes respectively.
type Topics = Array<[number, Uint8Array]> | null;

/**
 * Encodes a message for on-chain storage: compresses text with deflate (level 9),
 * uses raw bytes if compression doesn't help, packs with msgpack alongside any
 * topics, then prepends a version byte.
 */
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

/** Attempts pako inflate; falls back to raw UTF-8 decode for legacy uncompressed messages. */
function inflateOrDecode(bytes: Uint8Array): string {
	try {
		return pako.inflate(bytes, { to: 'string' });
	} catch {
		return new TextDecoder().decode(bytes);
	}
}

/**
 * Decodes raw on-chain message bytes into text and topics.
 * Handles v1 format (version byte + msgpack payload) and legacy format
 * (plain or pako-compressed text with no topics).
 */
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
// Inflight maps deduplicate concurrent requests for the same key —
// if two callers ask for the same address simultaneously, only one RPC call is made.
const ensNameInflight = new Map<string, Promise<string | null>>();
const ensAvatarInflight = new Map<string, Promise<string | null>>();

let ensClient: ReturnType<typeof createPublicClient> | null = null;

/** Returns a lazily-created mainnet viem client for ENS resolution. Returns null if VITE_ENS_RPC is not configured. */
function getEnsClient() {
	if (ensClient) return ensClient;
	const ensRpc = import.meta.env.VITE_ENS_RPC;
	if (!ensRpc) return null;
	ensClient = createPublicClient({ chain: mainnet, transport: http(ensRpc, { batch: true }) });
	return ensClient;
}

/**
 * Resolves an Ethereum address to its primary ENS name.
 * Cache hierarchy: memory → IDB (24h TTL) → mainnet RPC.
 * Returns null if unresolvable or ENS RPC is not configured.
 * Concurrent calls for the same address share a single in-flight request.
 */
export async function resolveEnsName(address: `0x${string}`): Promise<string | null> {
	const client = getEnsClient();
	if (!client) return null;
	if (ensCache.has(address)) return ensCache.get(address) ?? null;
	if (ensNameInflight.has(address)) return ensNameInflight.get(address)!;
	const promise = (async () => {
		try {
			const cached = await idbGetEns(`name:${address}`);
			if (cached !== undefined) {
				ensCache.set(address, cached);
				return cached;
			}
			const name = (await client.getEnsName({ address })) ?? null;
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

/**
 * Resolves an ENS name to its avatar URL.
 * Cache hierarchy: memory → IDB (24h TTL) → mainnet RPC.
 * Returns null if no avatar is set or ENS RPC is not configured.
 * Concurrent calls for the same name share a single in-flight request.
 */
export async function resolveEnsAvatar(name: string): Promise<string | null> {
	const client = getEnsClient();
	if (!client) return null;
	if (ensAvatarCache.has(name)) return ensAvatarCache.get(name) ?? null;
	if (ensAvatarInflight.has(name)) return ensAvatarInflight.get(name)!;
	const promise = (async () => {
		try {
			const cached = await idbGetEns(`avatar:${name}`);
			if (cached !== undefined) {
				ensAvatarCache.set(name, cached);
				return cached;
			}
			const avatar = (await client.getEnsAvatar({ name })) ?? null;
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

/** Returns the user-configured custom RPC URL from localStorage, or null if using the default. */
export function getCustomRpc(): string | null {
	return localStorage.getItem(LS_RPC_KEY);
}

/** Persists a custom RPC URL to localStorage. Pass null to clear and revert to the env default. */
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

/** Returns the singleton viem public client for the configured Pinbo chain. */
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

/**
 * Fetches on-chain info for an address in parallel: bytecode (to detect contracts),
 * ETH balance, and optional ERC-20 name/symbol (only populated for contracts).
 * All four RPC calls are settled concurrently; individual failures return safe defaults.
 */
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
		name: isContract && nameResult.status === 'fulfilled' ? (nameResult.value as string) : null,
		symbol:
			isContract && symbolResult.status === 'fulfilled' ? (symbolResult.value as string) : null,
	};
}

let feeCache: { value: bigint; ts: number } | null = null;
const FEE_TTL = 5 * 60 * 1000;

/** Returns the current posting fee in wei. Cached in memory for 5 minutes. */
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

/** Reads the latestMessageBlock value from the contract. */
async function getLatestMessageBlock(): Promise<bigint> {
	return (await getPublicClient().readContract({
		address: pinboContractAddress,
		abi: pinboAbi,
		functionName: 'latestMessageBlock',
		args: [],
	})) as bigint;
}

// Module-level shared state: the highest block that contained a message.
// Set once on mount via refreshLatestBlock() and refreshed every 60s.
// Used as the starting point for all backward log scans.
let cachedLatestBlock: bigint = 0n;

/** Refreshes cachedLatestBlock from the contract. Called on mount and every 60s. */
export async function refreshLatestBlock(): Promise<void> {
	cachedLatestBlock = await getLatestMessageBlock();
}

const MESSAGE_EVENT = parseAbiItem(
	'event MessagePosted(address indexed sender, bytes message, uint256 timestamp)'
);

const messageCache = new Map<string, Message>();

/** Converts a raw viem event log into a Message, saving it to both the memory cache and IDB. */
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

/**
 * Fetches and decodes MessagePosted logs in [fromBlock, toBlock].
 * Swaps the range if inverted. Throws on RPC error (callers handle retries/fallback).
 */
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

/**
 * Scans backward through blocks in PAGE_SIZE chunks from startBlock to stopBlock,
 * collecting messages until targetCount is reached or all blocks are exhausted.
 * @param args - getLogs filter for indexed fields (e.g. { sender: address })
 * @param onPage - called with each page's messages as they arrive
 * @param filter - optional client-side predicate for non-indexed fields (e.g. topics)
 * @returns collected messages (sorted newest-first) and the next unscanned block
 */
async function fetchPages(
	startBlock: bigint,
	stopBlock: bigint,
	targetCount: number,
	args?: Record<string, unknown>,
	onPage?: (pageMessages: Message[]) => void,
	filter?: (m: Message) => boolean
): Promise<{ messages: Message[]; nextBlock: bigint }> {
	let currentBlock = startBlock;
	const collected: Message[] = [];

	while (collected.length < targetCount && currentBlock > stopBlock) {
		// Clamp pageFrom so we never go below stopBlock.
		const pageFrom = currentBlock - PAGE_SIZE > stopBlock ? currentBlock - PAGE_SIZE : stopBlock;
		let pageMessages = await fetchLogsInRange(pageFrom, currentBlock, args);
		if (filter) pageMessages = pageMessages.filter(filter);
		collected.push(...pageMessages);
		onPage?.([...pageMessages]);
		currentBlock = pageFrom - 1n;
		// Break explicitly when we've reached stopBlock to avoid an off-by-one
		// extra iteration (currentBlock would underflow below stopBlock otherwise).
		if (pageFrom === stopBlock) break;
	}

	return { messages: collected.sort((a, b) => b.timestamp - a.timestamp), nextBlock: currentBlock };
}

/**
 * Factory for the main feed's stateful paginator.
 * Manages a hybrid IDB+RPC loading strategy with a block-range cursor.
 * Returns { loadInitialStreaming, loadMore, getState }.
 */
export function createMessageLoader() {
	let oldestBlockQueried: bigint | null = null;
	let latestBlockQueried: bigint | null = null;
	let idbMsgs: Message[] = [];
	let idbOffset = 0;

	/**
	 * Loads the initial feed page. Serves IDB messages immediately for instant display,
	 * then RPC-fetches only blocks newer than what's already cached.
	 */
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
				idbGetMeta('newestBlock').then((v) => (v !== null ? BigInt(v) : null)),
				idbGetMeta('oldestBlock').then((v) => (v !== null ? BigInt(v) : null)),
			]);
			if (idbMsgs.length > 0) {
				onPage?.(idbMsgs.slice(0, targetCount));
				idbOffset = Math.min(targetCount, idbMsgs.length);
			}
		} catch {
			/* IDB unavailable, fall through to RPC-only */
		}

		// Fetch from RPC only the blocks newer than what's already cached
		const fetchStop = newestCachedBlock !== null ? newestCachedBlock + 1n : CONTRACT_DEPLOY_BLOCK;
		if (startBlock >= fetchStop) {
			// If we have prior cache, fetch ALL new blocks to close the gap fully.
			// On first visit there's no cache, so stop after targetCount to show results quickly.
			const rpcTarget = newestCachedBlock !== null ? Infinity : targetCount;
			const { messages: _, nextBlock } = await fetchPages(
				startBlock,
				fetchStop,
				rpcTarget,
				undefined,
				onPage
			);
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

	/**
	 * Loads the next page of the feed. Serves remaining IDB messages first,
	 * then RPC-fetches older blocks once IDB is exhausted.
	 * Must be called after loadInitialStreaming.
	 */
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

		const { messages, nextBlock } = await fetchPages(
			oldestBlockQueried,
			CONTRACT_DEPLOY_BLOCK,
			targetCount
		);
		try {
			await idbSetMeta('oldestBlock', Number(nextBlock));
		} catch {}
		oldestBlockQueried = nextBlock;
		return { messages, hasMore: oldestBlockQueried > CONTRACT_DEPLOY_BLOCK };
	}

	return {
		loadInitialStreaming,
		loadMore,
		getState: () => ({ oldestBlockQueried, latestBlockQueried }),
	};
}

// Serves IDB-cached messages immediately via onPage, then RPC-fetches only the
// block range not yet in IDB. Used by getMessagesByAddress and getInboxMessages.
// rpcArgs filters by indexed contract fields (e.g. sender); rpcFilter is a
// client-side predicate for non-indexed fields (e.g. topics).
async function fetchAllWithCache(
	idbFilter: (m: Message) => boolean,
	rpcArgs: Record<string, unknown> | undefined,
	rpcFilter: ((m: Message) => boolean) | undefined,
	onPage?: (messages: Message[]) => void
): Promise<Message[]> {
	let oldestCachedBlock: bigint | null = null;
	let idbResults: Message[] = [];

	try {
		const [all, oldest] = await Promise.all([
			idbGetAllMessages(),
			idbGetMeta('oldestBlock').then((v) => (v !== null ? BigInt(v) : null)),
		]);
		oldestCachedBlock = oldest;
		idbResults = all.filter(idbFilter).sort((a, b) => b.timestamp - a.timestamp);
		if (idbResults.length > 0) onPage?.(idbResults);
	} catch {}

	// Full cache — no RPC needed
	if (oldestCachedBlock !== null && oldestCachedBlock <= CONTRACT_DEPLOY_BLOCK) {
		return idbResults;
	}

	// Partial or no cache — scan only the blocks not yet in IDB
	const rpcStartBlock = oldestCachedBlock !== null ? oldestCachedBlock - 1n : cachedLatestBlock;
	const { messages: rpcMessages, nextBlock } = await fetchPages(
		rpcStartBlock,
		CONTRACT_DEPLOY_BLOCK,
		Infinity,
		rpcArgs,
		onPage,
		rpcFilter
	);
	// Advance the oldestBlock cursor so subsequent calls skip this range.
	// Individual messages are already saved by logToMessage; this updates the scan bookmark.
	try {
		await idbSetMeta('oldestBlock', Number(nextBlock));
	} catch {}

	return [...idbResults, ...rpcMessages].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Returns all messages addressed to the given address via an ADDRESS topic.
 * Streams pages via onPage as they arrive (IDB first, then RPC for uncached blocks).
 */
export async function getInboxMessages(
	address: `0x${string}`,
	onPage?: (messages: Message[]) => void
): Promise<Message[]> {
	// Topics are not indexed on-chain, so we can't filter via getLogs args.
	// Use a client-side rpcFilter predicate instead.
	const addrLower = address.toLowerCase();
	const topicFilter = (m: Message) =>
		(m.topics ?? []).some(
			([type, bytes]) =>
				type === TOPIC_TYPE.ADDRESS && bytesToHex(bytes as Uint8Array).toLowerCase() === addrLower
		);
	return fetchAllWithCache(topicFilter, undefined, topicFilter, onPage);
}

/**
 * Returns all messages posted by the given address.
 * Streams pages via onPage as they arrive (IDB first, then RPC for uncached blocks).
 */
export async function getMessagesByAddress(
	address: `0x${string}`,
	onPage?: (messages: Message[]) => void
): Promise<Message[]> {
	const addrLower = address.toLowerCase();
	return fetchAllWithCache(
		(m) => m.sender.toLowerCase() === addrLower,
		{ sender: address },
		undefined,
		onPage
	);
}

/**
 * Sets up a wagmi account watcher that keeps the account/isConnected/wrongNetwork
 * stores in sync. Returns an unwatch function to be called on component destroy.
 */
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

/** Opens the AppKit wallet connection modal. In E2E test mode, bypasses the modal
 *  and connects directly via the injected window.ethereum provider. */
export function connect() {
	if (import.meta.env.VITE_E2E) {
		wagmiConnect(wagmiAdapter.wagmiConfig, { connector: injected() }).catch(console.error);
		return;
	}
	appKitModal.open();
}

/** Clears the IDB cache and disconnects the wallet via wagmi. */
export function disconnect() {
	idbClear().catch(() => {});
	wagmiDisconnect(wagmiAdapter.wagmiConfig);
}

/**
 * Encodes a message, estimates gas, and submits a postMessage transaction.
 * Fetches the current fee from the contract and attaches it as msg.value.
 * Returns the transaction hash.
 */
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

/**
 * Polls for new MessagePosted events every 60s and calls callback for each new message.
 * Returns an unwatch function to be called on component destroy.
 */
export function watchMessages(callback: (message: Message) => void) {
	return getPublicClient().watchContractEvent({
		address: pinboContractAddress,
		abi: pinboAbi,
		eventName: 'MessagePosted',
		pollingInterval: 60_000,
		onLogs: (logs) => logs.forEach((log) => callback(logToMessage(log))),
	});
}

/** Waits for a transaction to be mined, then returns the decoded Message. Used after postMessage. */
export async function waitForMessage(txHash: `0x${string}`) {
	await getPublicClient().waitForTransactionReceipt({ hash: txHash });
	return getMessageByTxHash(txHash);
}

const messageByTxHashInflight = new Map<string, Promise<Message>>();

/**
 * Fetches a single message by transaction hash.
 * Cache hierarchy: memory → IDB → RPC (receipt + block lookup).
 * Concurrent calls for the same hash share a single in-flight request.
 */
export async function getMessageByTxHash(txHash: `0x${string}`) {
	if (messageCache.has(txHash)) return messageCache.get(txHash)!;
	if (messageByTxHashInflight.has(txHash)) return messageByTxHashInflight.get(txHash)!;
	const promise = (async () => {
		try {
			const cached = await idbGetMessage(txHash);
			if (cached) {
				messageCache.set(txHash, cached);
				return cached;
			}
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
