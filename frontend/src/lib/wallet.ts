import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, sepolia } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, sepolia];

export const wagmiAdapter = new WagmiAdapter({ networks, projectId });

export const appKitModal = createAppKit({
	adapters: [wagmiAdapter],
	networks,
	defaultNetwork: mainnet,
	projectId,
	features: {
		analytics: false,
		email: false,
		socials: false,
	},
});
