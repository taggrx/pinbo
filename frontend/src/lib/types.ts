export interface Message {
  sender: `0x${string}`;
  message: string;
  timestamp: number;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export const ROUTES = {
  ABOUT: '#/about',
  MESSAGE: (txHash: string) => `#/message/${txHash}`,
} as const;
