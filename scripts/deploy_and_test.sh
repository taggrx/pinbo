#!/bin/bash
# Deploy contract, post test message, fetch logs
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

echo "=== Pinbo Local Test Workflow ==="
echo ""

# Step 1: Deploy contract
echo "1. Deploying Pinbo contract..."
DEPLOY_OUTPUT=$(PATH="$HOME/.foundry/bin:$PATH" forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$LOCAL_RPC_URL" \
    --private-key "$LOCAL_PRIVATE_KEY" \
    --broadcast)

# Extract contract address from output (simplistic)
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE "Pinbo deployed at: 0x[a-fA-F0-9]{40}" | cut -d' ' -f4)
if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Failed to extract contract address from output"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo "   Contract deployed at: $CONTRACT_ADDRESS"
echo ""

# Update .env.local with contract address
if grep -q "PINBO_CONTRACT_ADDRESS=" .env.local 2>/dev/null; then
    sed -i "s|PINBO_CONTRACT_ADDRESS=.*|PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS|" .env.local
else
    echo "PINBO_CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> .env.local
fi
echo "   Updated .env.local with contract address"
echo ""

# Wait a moment for block inclusion
sleep 2

# Step 2: Post a test message
echo "2. Posting test message..."
TEST_MESSAGE="Hello from local test!"
cast send "$CONTRACT_ADDRESS" \
    --rpc-url "$LOCAL_RPC_URL" \
    --private-key "$LOCAL_PRIVATE_KEY" \
    "postMessage(string)" "$TEST_MESSAGE"

echo "   Posted: \"$TEST_MESSAGE\""
echo ""

# Step 3: Fetch logs
echo "3. Fetching recent logs..."
echo ""
cast logs \
    --rpc-url "$LOCAL_RPC_URL" \
    --from-block 0 \
    --to-block latest \
    --address "$CONTRACT_ADDRESS" \
    "MessagePosted(address,string,uint256)"

echo ""
echo "=== Workflow completed successfully ==="