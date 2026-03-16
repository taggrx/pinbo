# Pinbo

Decentralized message board. Messages posted on-chain as compressed bytes via events, displayed newest-first.

## Stack

- **Contract**: Solidity ^0.8.13, Foundry (`forge build`, `forge test`, `cast`)
- **Frontend**: SvelteKit + Svelte 5 runes, TypeScript, viem (not ethers/web3.js), wagmi connectors, Arial (system font, no external loading)
- **Compression**: pako deflate on post, inflate on read — falls back to raw bytes if compressed is larger

## Key files

- `src/Pinbo.sol` — contract (postMessage, fee, feeRecipient, latestMessageBlock)
- `frontend/src/lib/ethereum.ts` — all viem logic: connect, read logs, post, watch events
- `frontend/src/lib/contract.ts` — ABI + contract address
- `frontend/src/lib/wagmi.ts` — wagmi config (Anvil local + mainnet + sepolia)
- `frontend/src/routes/+page.svelte` — main UI

## Svelte 5

Use runes only: `$state`, `$props`, `$derived`, `$effect`. Never Svelte 4 `$:` reactive statements or `export let`.

## CSS variables

`--primary`, `--secondary`, `--orange`, `--bg0`, `--surface-alt`, `--text-secondary`, `--error`

## Env vars

`VITE_LOCAL_RPC_URL`, `VITE_PINBO_CONTRACT_ADDRESS`, `VITE_CONTRACT_DEPLOY_BLOCK`, `VITE_ENS_RPC`, `VITE_WALLETCONNECT_PROJECT_ID`

## Rules

- Never touch code unless you were explicitly asked
- Never create commits
- Never start or stop servers
