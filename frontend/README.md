# Pinbo Frontend

Social pinbo frontend built with SvelteKit and Vite, using the Everforest theme.

## Features

- Connect Ethereum wallet (MetaMask)
- Post text messages to the Pinbo smart contract
- Real-time message feed (newest first)
- Minimalist design with Everforest color palette

## Prerequisites

- Node.js 18+
- Local Anvil node running on `http://localhost:8545`
- Deployed Pinbo contract (address set in `.env`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and set the contract address and RPC URL:

```bash
cp .env.example .env
```

3. Start the development server:

```bash
npm run dev
```

4. Open http://localhost:8080 in your browser.

## Environment Variables

- `VITE_PINBO_CONTRACT_ADDRESS`: Ethereum address of the deployed Pinbo contract
- `VITE_RPC_URL`: RPC URL of the local Ethereum node (default: http://localhost:8545)
- `VITE_WALLETCONNECT_PROJECT_ID`: Optional WalletConnect project ID (if using WalletConnect)

## Development

- `npm run dev` – start dev server with hot reload (binds to 0.0.0.0:8080, accessible from host machine)
- `npm run build` – build for production
- `npm run preview` – preview production build locally
- `npm run check` – run TypeScript and Svelte checks

## Architecture

- `src/lib/ethereum.ts` – Ethereum interaction logic (viem)
- `src/lib/contract.ts` – contract ABI and address
- `src/lib/chains.ts` – chain definitions
- `src/routes/+page.svelte` – main UI component
- `src/app.css` – Everforest theme CSS variables and global styles

## Theme

The UI uses the Everforest color palette (dark medium variant). CSS variables are defined in `app.css` and can be customized.

## Wallet Support

- MetaMask (injected provider)
- WalletConnect (optional, requires project ID)

## Smart Contract

The frontend expects a Pinbo contract with the following interface:

```solidity
event MessagePosted(address indexed sender, string message, uint256 timestamp);
function postMessage(string memory message) external;
```

## License

MIT
