import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, localhost } from 'wagmi/chains';
import { injected, walletConnect } from '@wagmi/connectors';

// Define local Anvil chain (chain id 31337)
const anvil = {
	id: 31337,
	name: 'Anvil',
	nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
	rpcUrls: {
		default: { http: [import.meta.env.VITE_LOCAL_RPC_URL || 'http://localhost:8545'] },
	},
} as const;

export const config = createConfig({
	chains: [anvil, mainnet, sepolia],
	connectors: [
		injected(),
		walletConnect({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '' }),
	],
	transports: {
		[anvil.id]: http(),
		[mainnet.id]: http(),
		[sepolia.id]: http(),
	},
});

// Contract address
export const pinboContractAddress = import.meta.env.VITE_PINBO_CONTRACT_ADDRESS as `0x${string}`;
