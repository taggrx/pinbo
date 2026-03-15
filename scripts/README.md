# Pinbo Deployment Scripts

Scripts for deploying and testing the Pinbo smart contract on any EVM chain.

## Prerequisites

- Foundry (forge, cast, anvil) installed
- For local development: Anvil running locally on port 8545 (use `./scripts/start_anvil.sh`)
- For testnet/mainnet: RPC URL and private key configured in `.env.local`

## Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Update `.env.local` with your configuration:
   - For local development: Use default Anvil values
   - For Sepolia testnet: Set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY`
   - For mainnet: Set `MAINNET_RPC_URL` and `MAINNET_PRIVATE_KEY`
   - For custom networks: Set `CUSTOM_RPC_URL`, `CUSTOM_PRIVATE_KEY`, and `CUSTOM_CHAIN_ID`

## Notes

- **Anvil restarts**: When you restart Anvil, all contract deployments are lost. Run `./scripts/deploy.sh local` to deploy a new contract.
- **Private key security**: Never commit `.env.local` to version control. The default Anvil private key (`0xac0974...`) is for testing only.
- **Contract address**: The `PINBO_CONTRACT_ADDRESS` in `.env.local` must match a deployed contract. If you get empty logs, verify the contract exists at that address (`cast code <address>`).

## Scripts

### `start_anvil.sh`
Starts Anvil local Ethereum node in background.
 - Runs on port 8545
 - Saves PID to `.anvil.pid`
 - Logs to `anvil.log`

### `stop_anvil.sh`
Stops the running Anvil process.

### `deploy.sh`
Deploy Pinbo contract to any EVM chain.

Usage:
```bash
# Deploy to local Anvil (default)
./scripts/deploy.sh

# Deploy to Sepolia testnet
./scripts/deploy.sh sepolia

# Deploy to mainnet
./scripts/deploy.sh mainnet

# Deploy to custom network
./scripts/deploy.sh custom
```

The script will:
1. Read network configuration from `.env.local`
2. Deploy contract using Foundry
3. Update `.env.local` with new contract address
4. Update `frontend/.env` with contract address and RPC URL

### `post_message.sh`
Post a message to the deployed contract. Automatically queries current fee.

Usage:
```bash
./scripts/post_message.sh "Your message here"
```

### `fetch_logs.sh`
Fetch and display all `MessagePosted` events in human-readable format.
- Shows block number, timestamp (UTC), sender address, message, and transaction hash
- Requires `jq` for formatted output (falls back to raw JSON)

Usage:
```bash
./scripts/fetch_logs.sh
```

### `mint_eth.sh`
Mint test ETH on local Anvil network.

Usage:
```bash
./scripts/mint_eth.sh
```

## Manual Testing with Foundry

### Run tests
```bash
forge test --gas-report
```

### Deploy contract manually
```bash
# Local deployment
forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast

# Sepolia deployment
forge script script/Deploy.s.sol:Deploy --rpc-url https://rpc.sepolia.org --private-key YOUR_PRIVATE_KEY --chain-id 11155111 --broadcast
```

### Send a transaction with cast
```bash
# First get current fee
FEE=$(cast call <CONTRACT_ADDRESS> "fee()" --rpc-url <RPC_URL>)
# Send with exact fee value
cast send <CONTRACT_ADDRESS> --rpc-url <RPC_URL> --private-key YOUR_PRIVATE_KEY --value $FEE "postMessage(bytes)" "Hello"
```

### View logs
```bash
cast logs --rpc-url <RPC_URL> --from-block 0 --to-block latest --address <CONTRACT_ADDRESS> "MessagePosted(address,bytes,uint256)"
```
