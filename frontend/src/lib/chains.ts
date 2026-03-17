import { defineChain } from 'viem';

// Get chain configuration from environment
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID ? parseInt(import.meta.env.VITE_CHAIN_ID) : 31337;
const RPC_URL = import.meta.env.VITE_RPC_URL;

export const pinboChain = defineChain({
	id: CHAIN_ID,
	name:
		CHAIN_ID === 31337
			? 'Anvil'
			: CHAIN_ID === 11155111
				? 'Sepolia'
				: CHAIN_ID === 1
					? 'Mainnet'
					: `Chain ${CHAIN_ID}`,
	nativeCurrency: {
		name: 'Ether',
		symbol: 'ETH',
		decimals: 18,
	},
	rpcUrls: {
		default: {
			http: [RPC_URL],
		},
	},
});

// Backward compatibility
export const anvil = pinboChain;
