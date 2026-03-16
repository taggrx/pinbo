import { createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect } from '@wagmi/connectors';
import { pinboChain } from './chains';

export const config = createConfig({
	chains: [pinboChain, mainnet, sepolia],
	connectors: [
		injected(),
		walletConnect({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '' }),
	],
	transports: {
		[pinboChain.id]: http(),
		[mainnet.id]: http(),
		[sepolia.id]: http(),
	},
});
