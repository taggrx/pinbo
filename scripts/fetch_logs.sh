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
LOGS_JSON=$(cast logs \
    --rpc-url "$LOCAL_RPC_URL" \
    --from-block 0 \
    --to-block latest \
    --address "$PINBOARD_CONTRACT_ADDRESS" \
    "MessagePosted(address,string,uint256)" \
    --json)

if command -v jq >/dev/null 2>&1; then
    echo "$LOGS_JSON" | jq -r '
        def hex2dec: 
            sub("^0x"; "") 
            | ascii_downcase 
            | explode 
            | map(if . >= 97 then . - 87 else . - 48 end) 
            | reduce .[] as $d (0; . * 16 + $d);
        def hex2str:
            sub("^0x"; "")
            | [scan("..")? // empty]
            | map( (.[0:1] + .[1:2]) | hex2dec )
            | map([.] | implode)
            | join("");
        def decode_message(data):
            data | sub("^0x"; "") 
            | .[128:192] as $len_hex   # length at position 128 chars (64 bytes)
            | (($len_hex | hex2dec) * 2) as $msg_len
            | .[192:192+$msg_len] as $msg_hex
            | $msg_hex | hex2str;
        
        if length == 0 then
            "No logs found."
        else
            .[] | 
            "Block #\(.blockNumber | hex2dec) (\(.blockTimestamp | hex2dec | strftime("%Y-%m-%d %H:%M:%S UTC")))",
            "  From:    \(.topics[1])",
            "  Message: \(decode_message(.data))",
            "  Tx:      \(.transactionHash)",
            ""
        end
    '
else
    echo "$LOGS_JSON"
    echo ""
    echo "Note: Install jq for formatted output."
fi