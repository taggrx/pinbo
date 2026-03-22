# Pinbo

Decentralized message board. Messages posted on-chain as compressed bytes via events, displayed newest-first.

## Stack

- **Contract**: Solidity ^0.8.13, Foundry (`forge build`, `forge test`, `cast`)
- **Frontend**: SvelteKit + Svelte 5 runes, TypeScript, viem (not ethers/web3.js), wagmi connectors, Arial (system font, no external loading)
- **Message encoding**: pako deflate (level 9, falls back to raw if larger) → msgpack `{ message, topics? }` → prepend version byte `0x01`
- **Topics**: array of `[type, payload]` tuples — `TOPIC_TYPE.REPOST` (tx hash bytes) or `TOPIC_TYPE.ADDRESS` (address bytes for DMs)

## Key files

- `src/Pinbo.sol` — contract (`postMessage`, `fee`, `feeRecipient`, `latestMessageBlock`)
- `frontend/src/lib/ethereum.ts` — all viem logic: encode/decode, ENS resolution, log fetching, caching, wallet, post
- `frontend/src/lib/idb.ts` — IndexedDB helpers: messages, scan bookmarks (`newestBlock`/`oldestBlock`), ENS entries (24h TTL)
- `frontend/src/lib/contract.ts` — ABI + contract address
- `frontend/src/lib/chains.ts` — chain config (Anvil/Sepolia/Mainnet via `VITE_CHAIN_ID`)
- `frontend/src/lib/wallet.ts` — AppKit/wagmi setup (WalletConnect + injected)
- `frontend/src/lib/types.ts` — `Message` interface, `ROUTES` constants
- `frontend/src/lib/utils.ts` — `renderMarkdown` (marked + DOMPurify)
- `frontend/src/routes/+page.svelte` — main UI, hash-based routing, all view state
- `frontend/src/lib/components/` — AppHeader, Message, MessageList, PostForm, ProfileView, InboxView, PermalinkView, UserBadge, TuiEditor, MarkdownContent, ErrorBanner

## Routing

Hash-based, handled in `+page.svelte`'s `handleHashChange`:

| Hash | View |
|------|------|
| `#/p/:txHash` | Permalink (single message) |
| `#/a/:address` | Profile (messages by address) |
| `#/i/:address` | Inbox (messages addressed to address) |
| `#/about` | README |

## Caching strategy

IDB stores messages keyed by `txHash`, plus two block cursors:
- `newestBlock` — highest block scanned (updated on each page load)
- `oldestBlock` — lowest block scanned (updated as history is loaded)

All log-fetching functions serve IDB immediately, then RPC-fetch only the uncached block range. Full cache hit (oldestBlock ≤ deploy block) skips RPC entirely.

## Svelte 5

Use runes only: `$state`, `$props`, `$derived`, `$effect`. Never Svelte 4 `$:` reactive statements or `export let`.

## CSS variables

`--primary`, `--secondary`, `--orange`, `--bg0`, `--surface-alt`, `--text-secondary`, `--error`

## Env vars

`VITE_RPC_URL`, `VITE_CHAIN_ID`, `VITE_PINBO_CONTRACT_ADDRESS`, `VITE_CONTRACT_DEPLOY_BLOCK`, `VITE_ENS_RPC`, `VITE_WALLETCONNECT_PROJECT_ID`

## Rules

- Never touch code unless you were explicitly asked
- Never create commits
- Never start or stop servers
