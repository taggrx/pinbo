import { writable, get } from 'svelte/store';
import { createPublicClient, createWalletClient, custom, http, parseAbiItem, hexToBytes, bytesToHex } from 'viem';
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
export const publicClient = createPublicClient({
  chain: anvil,
  transport: http(),
});

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
    
    walletClient = createWalletClient({
      chain: anvil,
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
    
    // Create wallet client
    walletClient = createWalletClient({
      chain: anvil,
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
    console.log(`Compressed: ${originalSize} -> ${compressedSize} bytes (${(compressedSize / originalSize * 100).toFixed(1)}%)`);
    dataToStore = compressed;
  } else {
    console.log(`Using plain bytes: ${originalSize} bytes (compression would be larger)`);
    dataToStore = originalBytes;
  }
  
  const dataHex = bytesToHex(dataToStore);
  const hash = await walletClient.writeContract({
    address: pinboContractAddress,
    abi: pinboAbi,
    functionName: 'postMessage',
    args: [dataHex],
    account: currentAccount,
    chain: anvil,
  });
  return hash;
}

// Fetch past messages (events)
export async function fetchMessages(limit = 50) {
  const logs = await publicClient.getLogs({
    address: pinboContractAddress,
    event: parseAbiItem('event MessagePosted(address indexed sender, bytes message, uint256 timestamp)'),
    fromBlock: 0n,
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
    };
  });
  // Sort by timestamp descending (newest first)
  messages.sort((a, b) => b.timestamp - a.timestamp);
  return messages.slice(0, limit);
}

// Subscribe to new messages
export function watchMessages(callback: (message: any) => void) {
  return publicClient.watchContractEvent({
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
        });
      });
    },
  });
}