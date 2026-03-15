import { parseAbi } from 'viem';
import abi from './abi.json';

export const pinboContractAddress = (import.meta.env.VITE_PINBO_CONTRACT_ADDRESS || '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318') as `0x${string}`;

// ABI from JSON (already in correct format)
export const pinboAbi = parseAbi([
  'function fee() view returns (uint256)',
  'function latestMessageBlock() view returns (uint256)',
  'function postMessage(bytes message) payable',
  'event MessagePosted(address indexed sender, bytes message, uint256 timestamp)',
]);

// Alternatively, use the raw ABI (if needed for other libraries)
export const pinboRawAbi = abi;