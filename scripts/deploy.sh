#!/bin/bash
# Deploy Pinbo contract
# Requires Anvil running locally on default port (8545)

set -e

# Load environment
if [ -f .env.local ]; then
    source .env.local
elif [ -f .env ]; then
    source .env
else
    echo "Error: No .env.local or .env file found"
    exit 1
fi

: "${LOCAL_RPC_URL:?LOCAL_RPC_URL not set}"
: "${LOCAL_PRIVATE_KEY:?LOCAL_PRIVATE_KEY not set}"

echo "Deploying Pinbo contract..."

DEPLOY_OUTPUT=$(PATH="$HOME/.foundry/bin:$PATH" forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$LOCAL_RPC_URL" \
    --private-key "$LOCAL_PRIVATE_KEY" \
    --broadcast)

# Extract contract address from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE "Pinbo deployed at: 0x[a-fA-F0-9]{40}" | cut -d' ' -f4)
if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Failed to extract contract address from output"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo "Contract deployed at: $CONTRACT_ADDRESS"

# Update .env.local with contract address
if grep -q "PINBO_CONTRACT_ADDRESS=" .env.local 2>/dev/null; then
    sed -i "s|PINBO_CONTRACT_ADDRESS=.*|PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS|" .env.local
else
    echo "PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> .env.local
fi
echo "Updated .env.local"

# Update frontend/.env with contract address
if [ -f frontend/.env ]; then
    if grep -q "VITE_PINBO_CONTRACT_ADDRESS=" frontend/.env; then
        sed -i "s|VITE_PINBO_CONTRACT_ADDRESS=.*|VITE_PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS|" frontend/.env
    else
        echo "VITE_PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> frontend/.env
    fi
    echo "Updated frontend/.env"
else
    echo "VITE_PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" > frontend/.env
    echo "Created frontend/.env"
fi

echo "Done!"
