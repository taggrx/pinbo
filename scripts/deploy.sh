#!/bin/bash
# Deploy Pinbo contract to any EVM chain
# Usage: ./scripts/deploy.sh [network]
#   network: local (default), sepolia, mainnet, or custom

set -e

NETWORK="${1:-local}"
echo "Deploying to network: $NETWORK"

# Determine env file for this network
case "$NETWORK" in
    local|anvil)
        ENV_FILE=".env.local"
        ;;
    sepolia)
        ENV_FILE=".env.sepolia"
        ;;
    mainnet)
        ENV_FILE=".env.mainnet"
        ;;
    custom)
        ENV_FILE=".env.custom"
        ;;
    *)
        echo "Error: Unknown network '$NETWORK'. Valid options: local, sepolia, mainnet, custom"
        exit 1
        ;;
esac

# Load the network-specific env file
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
elif [ -f .env ]; then
    source .env
else
    echo "Error: No $ENV_FILE or .env file found"
    exit 1
fi

# Set network-specific variables from loaded env
case "$NETWORK" in
    local|anvil)
        RPC_URL="${LOCAL_RPC_URL:-http://localhost:8545}"
        PRIVATE_KEY="${LOCAL_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
        CHAIN_ID="${LOCAL_CHAIN_ID:-31337}"
        ;;
    sepolia)
        RPC_URL="${SEPOLIA_RPC_URL:-https://rpc.sepolia.org}"
        PRIVATE_KEY="${SEPOLIA_PRIVATE_KEY}"
        CHAIN_ID="${SEPOLIA_CHAIN_ID:-11155111}"
        ;;
    mainnet)
        RPC_URL="${MAINNET_RPC_URL}"
        PRIVATE_KEY="${MAINNET_PRIVATE_KEY}"
        CHAIN_ID="${MAINNET_CHAIN_ID:-1}"
        ;;
    custom)
        RPC_URL="${CUSTOM_RPC_URL}"
        PRIVATE_KEY="${CUSTOM_PRIVATE_KEY}"
        CHAIN_ID="${CUSTOM_CHAIN_ID}"
        ;;
esac

if [ -z "$RPC_URL" ]; then
    echo "Error: RPC_URL not set for network '$NETWORK'"
    echo "Please set RPC_URL in $ENV_FILE or .env"
    exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "Error: PRIVATE_KEY not set for network '$NETWORK'"
    echo "Please set PRIVATE_KEY in $ENV_FILE or .env"
    exit 1
fi

if [ -z "$CHAIN_ID" ]; then
    echo "Error: CHAIN_ID not set for network '$NETWORK'"
    echo "Please set CHAIN_ID in $ENV_FILE or .env"
    exit 1
fi

echo "RPC URL: $RPC_URL"
echo "Chain ID: $CHAIN_ID"
echo "Private key: ${PRIVATE_KEY:0:10}..."

# Check if forge is available
FORGE_PATH="$HOME/.foundry/bin/forge"
if [ ! -f "$FORGE_PATH" ]; then
    FORGE_PATH="forge"
fi

if ! command -v "$FORGE_PATH" >/dev/null 2>&1; then
    echo "Error: forge not found. Please install Foundry first."
    exit 1
fi

echo "Using forge at: $FORGE_PATH"
$FORGE_PATH --version

echo "=== Deploying Pinbo contract ==="
echo "Waiting for deployment..."

# Run deployment
set +e
DEPLOY_OUTPUT=$($FORGE_PATH script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --chain-id "$CHAIN_ID" \
    --broadcast 2>&1)
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ]; then
    echo "=== FORGE OUTPUT START ==="
    echo "$DEPLOY_OUTPUT"
    echo "=== FORGE OUTPUT END ==="
    echo "Error: Deployment failed with exit code $EXIT_CODE"
    exit $EXIT_CODE
fi

# Extract contract address from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE "Pinbo deployed at: 0x[a-fA-F0-9]{40}" | cut -d' ' -f4)
if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "=== FORGE OUTPUT START ==="
    echo "$DEPLOY_OUTPUT"
    echo "=== FORGE OUTPUT END ==="
    echo "Error: Failed to extract contract address from output"
    exit 1
fi

echo "Contract deployed at: $CONTRACT_ADDRESS"

# Try to extract transaction hash from forge output
TX_HASH=$(echo "$DEPLOY_OUTPUT" | grep -oE "Transaction hash: 0x[a-fA-F0-9]{64}" | cut -d' ' -f3)
DEPLOY_BLOCK=""

if [ -n "$TX_HASH" ]; then
    echo "Deployment transaction hash: $TX_HASH"
    # Get block number from transaction receipt
    if command -v cast >/dev/null 2>&1; then
        DEPLOY_BLOCK=$(cast receipt "$TX_HASH" --rpc-url "$RPC_URL" --json | jq -r '.blockNumber' 2>/dev/null || echo "")
        if [ -n "$DEPLOY_BLOCK" ] && [ "$DEPLOY_BLOCK" != "null" ]; then
            echo "Deployment block number: $DEPLOY_BLOCK"
        else
            DEPLOY_BLOCK=""
        fi
    fi
fi

# Fallback: get current block number if deploy block not found
if [ -z "$DEPLOY_BLOCK" ]; then
    echo "Warning: Could not determine deployment block, using current block as fallback"
    if command -v cast >/dev/null 2>&1; then
        DEPLOY_BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "")
    fi
    if [ -z "$DEPLOY_BLOCK" ]; then
        DEPLOY_BLOCK="0"
    fi
fi

# Update environment files
echo "=== Updating environment files ==="

# Update main .env.local with contract address and deploy block
if [ -f "$ENV_FILE" ]; then
    if grep -q "PINBO_CONTRACT_ADDRESS=" "$ENV_FILE"; then
        sed -i "s|PINBO_CONTRACT_ADDRESS=.*|PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS|" "$ENV_FILE"
    else
        echo "PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> "$ENV_FILE"
    fi
    # Add or update deploy block
    if grep -q "CONTRACT_DEPLOY_BLOCK=" "$ENV_FILE"; then
        sed -i "s|CONTRACT_DEPLOY_BLOCK=.*|CONTRACT_DEPLOY_BLOCK=$DEPLOY_BLOCK|" "$ENV_FILE"
    else
        echo "CONTRACT_DEPLOY_BLOCK=$DEPLOY_BLOCK" >> "$ENV_FILE"
    fi
    echo "Updated $ENV_FILE"
else
    echo "PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" > "$ENV_FILE"
    echo "CONTRACT_DEPLOY_BLOCK=$DEPLOY_BLOCK" >> "$ENV_FILE"
    echo "Created $ENV_FILE"
fi

# Update frontend/.env with contract address, RPC URL, chain ID, and deploy block
FRONTEND_ENV="frontend/.env"
if [ -f "$FRONTEND_ENV" ]; then
    sed -i "s|VITE_PINBO_CONTRACT_ADDRESS=.*|VITE_PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS|" "$FRONTEND_ENV"
    sed -i "s|VITE_RPC_URL=.*|VITE_RPC_URL=$RPC_URL|" "$FRONTEND_ENV"
    # Add or update chain ID
    if grep -q "VITE_CHAIN_ID=" "$FRONTEND_ENV"; then
        sed -i "s|VITE_CHAIN_ID=.*|VITE_CHAIN_ID=$CHAIN_ID|" "$FRONTEND_ENV"
    else
        echo "VITE_CHAIN_ID=$CHAIN_ID" >> "$FRONTEND_ENV"
    fi
    # Add or update deploy block
    if grep -q "VITE_CONTRACT_DEPLOY_BLOCK=" "$FRONTEND_ENV"; then
        sed -i "s|VITE_CONTRACT_DEPLOY_BLOCK=.*|VITE_CONTRACT_DEPLOY_BLOCK=$DEPLOY_BLOCK|" "$FRONTEND_ENV"
    else
        echo "VITE_CONTRACT_DEPLOY_BLOCK=$DEPLOY_BLOCK" >> "$FRONTEND_ENV"
    fi
    echo "Updated $FRONTEND_ENV"
else
    echo "VITE_PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" > "$FRONTEND_ENV"
    echo "VITE_RPC_URL=$RPC_URL" >> "$FRONTEND_ENV"
    echo "VITE_CHAIN_ID=$CHAIN_ID" >> "$FRONTEND_ENV"
    echo "VITE_CONTRACT_DEPLOY_BLOCK=$DEPLOY_BLOCK" >> "$FRONTEND_ENV"
    echo "Created $FRONTEND_ENV"
fi

echo "=== Deployment complete ==="
echo "Network: $NETWORK"
echo "Contract: $CONTRACT_ADDRESS"
echo "RPC URL: $RPC_URL"
echo "Chain ID: $CHAIN_ID"
echo ""
echo "Next steps:"
echo "1. Update your wallet to connect to chain ID $CHAIN_ID"
echo "2. Use the frontend with VITE_RPC_URL=$RPC_URL"
echo "3. Test posting a message with: ./scripts/post_message.sh \"Hello world\""