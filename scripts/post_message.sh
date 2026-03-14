#!/bin/bash
# Post a message to Pinboard contract

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

# Check required variables
: "${LOCAL_RPC_URL:?LOCAL_RPC_URL not set}"
: "${LOCAL_PRIVATE_KEY:?LOCAL_PRIVATE_KEY not set}"
: "${PINBOARD_CONTRACT_ADDRESS:?PINBOARD_CONTRACT_ADDRESS not set}"

# Get message from command line
if [ $# -eq 0 ]; then
    echo "Usage: $0 <message>"
    exit 1
fi
MESSAGE="$1"

echo "Posting message to contract $PINBOARD_CONTRACT_ADDRESS..."
echo "Message: $MESSAGE"

# Send transaction
cast send "$PINBOARD_CONTRACT_ADDRESS" \
    --rpc-url "$LOCAL_RPC_URL" \
    --private-key "$LOCAL_PRIVATE_KEY" \
    "postMessage(string)" "$MESSAGE"

echo "Transaction sent successfully!"