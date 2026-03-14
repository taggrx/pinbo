# Pinboard Implementation Milestones

## Overview
Pinboard is a social pinboard on Ethereum where users post text messages. The smart contract emits logs, and the frontend displays messages in order (newest first).

## Tech Stack Decisions
- **Ethereum Network**: Local development (Foundry/Anvil)
- **Frontend**: Svelte with Vite (plain CSS)
- **Contract Framework**: Foundry
- **Contract Storage**: Events only (no on-chain storage)
- **Message Order**: Newest at top
- **Message Limits**: Gas-bound (no explicit character limit)
- **Timestamps**: Yes, from `block.timestamp`
- **User Identification**: Ethereum address only
- **Wallet Support**: MetaMask + WalletConnect (wagmi connectors)
- **Ethereum Library**: viem + wagmi
- **UI Library**: None (custom CSS)
- **Additional Features**: None for now (basic posting only)

---

## Milestone 1: Smart Contract & Local Testing
**Goal**: Set up project, create smart contract, and test framework locally without frontend.

### Tasks
1. **Project Setup**
   - Initialize Foundry project (`forge init`)
   - Configure `foundry.toml` for local development
   - Set up `.env` template for environment variables

2. **Smart Contract Development**
   - Create `Pinboard.sol` contract with:
     - `postMessage(string memory message)` function
     - `MessagePosted(address indexed sender, string message, uint256 timestamp)` event
     - No storage variables
   - Write Foundry tests for:
     - Event emission verification
     - Gas usage estimation
     - Edge cases (empty string, long messages)

3. **Local Network & Deployment**
   - Set up Anvil local node
   - Create deployment script (`script/Deploy.s.sol`)
   - Deploy contract to local network
   - Save contract address to `.env.local`

4. **Testing Tools & Scripts**
   - Create `scripts/post_message.sh` (or `.py`) to:
     - Send transaction to post message via `cast`
     - Accept message as argument
   - Create `scripts/fetch_logs.sh` (or `.py`) to:
     - Fetch and format recent `MessagePosted` events via `cast`
     - Display sender, message, timestamp in readable format
   - Create `scripts/test_workflow.sh` that:
     - Starts Anvil (if not running)
     - Deploys contract
     - Posts a test message
     - Fetches and displays logs

5. **Verification**
   - Manual testing using scripts
   - Confirm events are emitted correctly
   - Ensure timestamps and addresses are accurate

**Exit Criteria**: Able to run a single script that deploys contract, posts message, and retrieves formatted logs without remembering complex `cast` commands.

---

## Milestone 2: Frontend Implementation
**Goal**: Build frontend that connects to local network and provides full user interface.

### Tasks
1. **Frontend Project Setup**
   - Initialize Svelte project with Vite (`npm create svelte@latest`)
   - Install dependencies: viem, wagmi, @wagmi/connectors
   - Configure Vite for local development

2. **Wallet Integration**
   - Set up wagmi configuration for local Anvil RPC
   - Configure MetaMask and WalletConnect connectors
   - Create wallet connection component
   - Display connected account address and balance

3. **Contract Integration**
   - Generate TypeScript bindings from contract ABI (`forge inspect Pinboard abi`)
   - Create viem contract instance
   - Implement `useWatchContractEvent` for real-time message updates
   - Implement historical event fetching on component mount

4. **UI Components**
   - Message list component (newest first)
     - Display sender address (truncated), message, timestamp (formatted)
     - Auto-refresh when new events arrive
   - Message posting component
     - Textarea with character counter (gas estimation)
     - Submit button (disabled when not connected)
     - Transaction status feedback
   - Layout with header (title, wallet connect) and main content

5. **Styling**
   - Basic CSS for readability
   - Responsive design for mobile/desktop
   - Transaction state indicators (pending, success, error)

6. **Testing**
   - Connect wallet, post messages, verify real-time updates
   - Test with multiple browser tabs/wallets
   - Verify message ordering (newest first)

**Exit Criteria**: Full working frontend on local network where users can connect wallet, post messages, and see live updates.

---

## Milestone 3: Production Deployment
**Goal**: Deploy smart contract to Ethereum mainnet and configure frontend for production.

### Tasks
1. **Contract Optimization & Audit**
   - Review gas optimizations
   - Consider adding pause/upgrade mechanisms if needed
   - Basic security review

2. **Mainnet Deployment**
   - Configure Foundry for mainnet (environment variables, RPC URLs)
   - Create production deployment script
   - Deploy contract to Ethereum mainnet
   - Verify contract on Etherscan (if desired)

3. **Frontend Production Configuration**
   - Update wagmi configuration for mainnet RPC
   - Add environment-based configuration (local vs production)
   - Configure WalletConnect project ID
   - Build and test production bundle

4. **Hosting & Distribution**
   - Choose hosting platform (Vercel, Netlify, IPFS, etc.)
   - Set up CI/CD for frontend deployments
   - Configure custom domain if needed

5. **Documentation & User Guide**
   - Update README with deployment instructions
   - Add user guide for wallet connection and posting
   - Include troubleshooting section

**Exit Criteria**: Contract deployed to mainnet, frontend hosted and accessible, users can post messages to live network.

---

## Notes
- Each milestone should be completed and verified before moving to the next
- All code will be version controlled (git)
- Environment variables should never be committed to repository
- Focus on simplicity and minimal dependencies