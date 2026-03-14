#!/bin/bash
# Post a message to Pinbo contract

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
: "${PINBO_CONTRACT_ADDRESS:?PINBO_CONTRACT_ADDRESS not set}"

# Get message from command line
if [ $# -eq 0 ]; then
    echo "Usage: $0 <message>"
    exit 1
fi
MESSAGE="$1"

# Convert string to hex for bytes parameter
MESSAGE_HEX=$(printf '%s' "$MESSAGE" | xxd -p -u | tr -d '\n')

echo "Posting message to contract $PINBO_CONTRACT_ADDRESS..."
echo "Message: $MESSAGE"

# Send transaction
cast send "$PINBO_CONTRACT_ADDRESS" \
    --rpc-url "$LOCAL_RPC_URL" \
    --private-key "$LOCAL_PRIVATE_KEY" \
    "postMessage(bytes)" "$MESSAGE_HEX"

echo "Transaction sent successfully!"