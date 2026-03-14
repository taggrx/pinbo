import { defineChain } from 'viem';

export const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_LOCAL_RPC_URL || 'http://localhost:8545'],
    },
  },
});