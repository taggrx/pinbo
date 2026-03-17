export interface Message {
	sender: `0x${string}`;
	message: string;
	timestamp: number;
	blockNumber: bigint;
	txHash: `0x${string}`;
	topics?: Array<[number, Uint8Array]> | null;
}

export const ROUTES = {
	ABOUT: '#/about',
	MESSAGE: (txHash: string) => `#/p/${txHash}`,
} as const;
