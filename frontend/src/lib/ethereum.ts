import { writable, get } from 'svelte/store';
import { createPublicClient, createWalletClient, custom, http, parseAbiItem, hexToBytes, bytesToHex, decodeEventLog } from 'viem';
import { anvil } from './chains';
import { pinboContractAddress, pinboAbi } from './contract';
import pako from 'pako';

// Types
type EthereumProvider = any; // TODO: better type

// Store for connected account
export const account = writable<`0x${string}` | null>(null);
export const isConnected = writable(false);
export const error = writable<string | null>(null);

const STORAGE_KEY = 'pinbo_account';

// Public client (read-only)
function getPublicClient() {
  const rpcUrl = import.meta.env.VITE_LOCAL_RPC_URL || 'http://localhost:8545';
  return createPublicClient({
    chain: anvil,
    transport: http(rpcUrl),
  });
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
      chain: { id: chainId, name: 'Unknown', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [] } } },
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
      chain: { id: chainId, name: 'Unknown', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [] } } },
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
  
  const originalBytes = new TextEncoder().encode(message);
  const compressed = pako.deflate(message, { level: 9 });
  
  const originalSize = originalBytes.length;
  const compressedSize = compressed.length;
  
  let dataToStore: Uint8Array;
  if (compressedSize < originalSize) {
    dataToStore = compressed;
  } else {
    dataToStore = originalBytes;
  }
  
  const dataHex = bytesToHex(dataToStore);
  const hash = await walletClient.writeContract({
    address: pinboContractAddress,
    abi: pinboAbi,
    functionName: 'postMessage',
    args: [dataHex],
    account: currentAccount,
  });
  return hash;
}

// Fetch past messages (events)
export async function fetchMessages(limit = 50) {
  // Start from Sepolia deployment block to avoid RPC limit
  const logs = await getPublicClient().getLogs({
    address: pinboContractAddress,
    event: parseAbiItem('event MessagePosted(address indexed sender, bytes message, uint256 timestamp)'),
    fromBlock: 10420000n,
    toBlock: 'latest',
  });
  // Transform logs (decompress)
  const messages = logs.map((log) => {
    const messageHex = log.args.message as `0x${string}`;
    const data = hexToBytes(messageHex);
    let decompressed: string;
    try {
      decompressed = pako.inflate(data, { to: 'string' });
    } catch {
      decompressed = new TextDecoder().decode(data);
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
  return messages.slice(0, limit);
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

// Get message by transaction hash
export async function getMessageByTxHash(txHash: `0x${string}`) {
  const receipt = await getPublicClient().getTransactionReceipt({ hash: txHash });
  const log = receipt.logs.find((l) => l.address.toLowerCase() === pinboContractAddress.toLowerCase());
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