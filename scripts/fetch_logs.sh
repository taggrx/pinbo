#!/bin/bash
# Fetch and display recent MessagePosted events

set -e

# Load environment variables
if [ -f .env.local ]; then
    source .env.local
elif [ -f .env ]; then
    source .env
else
    echo "Error: No .env.local or .env file found"
    exit 1
fi

: "${LOCAL_RPC_URL:?LOCAL_RPC_URL not set}"
: "${PINBOARD_CONTRACT_ADDRESS:?PINBOARD_CONTRACT_ADDRESS not set}"

echo "Fetching logs for contract $PINBOARD_CONTRACT_ADDRESS..."
echo ""

# Get logs for MessagePosted event
# Event signature: MessagePosted(address indexed sender, string message, uint256 timestamp)
# Get all logs from block 0 to latest
cast logs \
    --rpc-url "$LOCAL_RPC_URL" \
    --from-block 0 \
    --to-block latest \
    --address "$PINBOARD_CONTRACT_ADDRESS" \
    "MessagePosted(address,string,uint256)"

echo ""
echo "Note: For better formatting, install jq and update this script."