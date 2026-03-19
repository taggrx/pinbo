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
	INBOX: '#/inbox',
	MESSAGE: (txHash: string) => `#/p/${txHash}`,
	PROFILE: (address: string) => `#/u/${address}`,
} as const;
