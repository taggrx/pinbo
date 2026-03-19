import { writable, get } from 'svelte/store';
import {
	createPublicClient,
	http,
	parseAbiItem,
	hexToBytes,
	bytesToHex,
	decodeEventLog,
} from 'viem';
import { mainnet } from 'viem/chains';
import { watchAccount, getWalletClient, disconnect as wagmiDisconnect } from '@wagmi/core';
import { wagmiAdapter, appKitModal } from './wallet';
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

const publicClient = createPublicClient({
	chain: pinboChain,
	transport: http(import.meta.env.VITE_RPC_URL),
});

function getPublicClient() {
	return publicClient;
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

export async function getMessagesByAddress(
	address: `0x${string}`,
	onPage?: (messages: Message[]) => void
): Promise<Message[]> {
	const latestBlock = await getPublicClient().getBlockNumber();
	const { messages } = await fetchPages(latestBlock, CONTRACT_DEPLOY_BLOCK, Infinity, { sender: address }, onPage);
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
