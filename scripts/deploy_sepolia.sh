#!/bin/bash
# Deploy Pinbo contract to Sepolia testnet

set -e

RPC_URL="${SEPOLIA_RPC_URL:-https://rpc.sepolia.org}"
PRIVATE_KEY="${SEPOLIA_PRIVATE_KEY:-$1}"

echo "RPC_URL: $RPC_URL"
echo "PRIVATE_KEY: ${PRIVATE_KEY:0:10}..."

if [ -z "$PRIVATE_KEY" ]; then
    echo "Usage: ./deploy_sepolia.sh <private_key>"
    echo "Or set SEPOLIA_PRIVATE_KEY environment variable"
    exit 1
fi

echo "=== Deploying to Sepolia ==="
echo "RPC: $RPC_URL"
echo "Waiting for deployment..."

FORGE_PATH="$HOME/.foundry/bin/forge"
if [ ! -f "$FORGE_PATH" ]; then
    FORGE_PATH="forge"
fi

echo "Using forge at: $FORGE_PATH"
$FORGE_PATH --version

echo "Running forge script..."
set +e
DEPLOY_OUTPUT=$($FORGE_PATH script script/Deploy.s.sol:Deploy \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --chain-id 11155111 \
    --broadcast 2>&1)
EXIT_CODE=$?
set -e

echo "Forge exit code: $EXIT_CODE"
echo "=== FORGE OUTPUT START ==="
echo "$DEPLOY_OUTPUT"
echo "=== FORGE OUTPUT END ==="

# Extract contract address from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE "Pinbo deployed at: 0x[a-fA-F0-9]{40}" | cut -d' ' -f4)
if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Failed to extract contract address from output"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo "Contract deployed at: $CONTRACT_ADDRESS"

# Update frontend .env with Sepolia contract address
if [ -f frontend/.env ]; then
    sed -i "s|VITE_PINBO_CONTRACT_ADDRESS=.*|VITE_PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS|" frontend/.env
    sed -i "s|VITE_LOCAL_RPC_URL=.*|VITE_LOCAL_RPC_URL=$RPC_URL|" frontend/.env
    echo "Updated frontend/.env"
else
    echo "VITE_PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" > frontend/.env
    echo "VITE_LOCAL_RPC_URL=$RPC_URL" >> frontend/.env
    echo "Created frontend/.env"
fi

echo "Done!"
