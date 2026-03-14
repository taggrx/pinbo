import { writable, get } from 'svelte/store';
import { createPublicClient, createWalletClient, custom, http, parseAbiItem } from 'viem';
import { anvil } from './chains';
import { pinboContractAddress, pinboAbi } from './contract';

// Types
type EthereumProvider = any; // TODO: better type

// Store for connected account
export const account = writable<`0x${string}` | null>(null);
export const isConnected = writable(false);
export const error = writable<string | null>(null);

// Public client (read-only)
export const publicClient = createPublicClient({
  chain: anvil,
  transport: http(),
});

// Wallet client (for sending transactions)
let walletClient: ReturnType<typeof createWalletClient> | null = null;

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
}

// Post a message
export async function postMessage(message: string) {
  if (!walletClient) {
    throw new Error('Not connected');
  }
  const currentAccount = get(account);
  if (!currentAccount) {
    throw new Error('No account');
  }
  const hash = await walletClient.writeContract({
    address: pinboContractAddress,
    abi: pinboAbi,
    functionName: 'postMessage',
    args: [message],
    account: currentAccount,
    chain: anvil,
  });
  return hash;
}

// Fetch past messages (events)
export async function fetchMessages(limit = 50) {
  const logs = await publicClient.getLogs({
    address: pinboContractAddress,
    event: parseAbiItem('event MessagePosted(address indexed sender, string message, uint256 timestamp)'),
    fromBlock: 0n,
    toBlock: 'latest',
  });
  // Transform logs
  const messages = logs.map((log) => ({
    sender: log.args.sender as `0x${string}`,
    message: log.args.message as string,
    timestamp: Number(log.args.timestamp) * 1000, // convert to ms
    blockNumber: log.blockNumber,
  }));
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
        callback({
          sender: log.args.sender,
          message: log.args.message,
          timestamp: Number(log.args.timestamp) * 1000,
          blockNumber: log.blockNumber,
        });
      });
    },
  });
}