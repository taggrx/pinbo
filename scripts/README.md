# Pinbo Local Testing Scripts

Scripts for testing the Pinbo smart contract locally with Foundry/Anvil.

## Prerequisites

- Foundry (forge, cast, anvil) installed
- Anvil running locally on port 8545 (use `./scripts/start_anvil.sh`)

## Environment Setup

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Update `.env.local` if needed (default values work with Anvil)

## Notes

- **Anvil restarts**: When you restart Anvil, all contract deployments are lost. Run `./scripts/deploy_and_test.sh` to deploy a new contract and update the address in `.env.local`.
- **Private key**: `.env.local` contains the default Anvil private key (`0xac0974...`) for testing only.
- **Contract address**: The `PINBO_CONTRACT_ADDRESS` in `.env.local` must match a deployed contract. If you get empty logs, verify the contract exists at that address (`cast code <address>`).

## Scripts

### `start_anvil.sh`
Starts Anvil local Ethereum node in background.
 - Runs on port 8545
 - Saves PID to `.anvil.pid`
 - Logs to `anvil.log`

### `stop_anvil.sh`
Stops the running Anvil process.

### `deploy_and_test.sh`
Full workflow:
1. Deploys Pinbo contract
2. Updates `.env.local` with contract address
3. Posts a test message
4. Fetches and displays logs

Usage:
```bash
./scripts/deploy_and_test.sh
```

### `post_message.sh`
Post a message to the deployed contract.

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

## Manual Testing with Foundry

### Run tests
```bash
forge test --gas-report
```

### Deploy contract manually
```bash
forge script script/Deploy.s.sol:Deploy --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
```

### Send a transaction with cast
```bash
# First get current fee
FEE=$(cast call <CONTRACT_ADDRESS> "fee()" --rpc-url http://localhost:8545)
# Send with exact fee value
cast send <CONTRACT_ADDRESS> --rpc-url http://localhost:8545 --private-key 0xac0974... --value $FEE "postMessage(bytes)" "Hello"
```

### View logs
```bash
cast logs --rpc-url http://localhost:8545 --from-block 0 --to-block latest --address <CONTRACT_ADDRESS> "MessagePosted(address,bytes,uint256)"
```
