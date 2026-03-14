#!/bin/bash
# Start Anvil local Ethereum node in background

set -e

PORT=8545
PID_FILE=".anvil.pid"
LOG_FILE="anvil.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Anvil already running (PID: $PID)"
        exit 0
    else
        rm "$PID_FILE"
    fi
fi

echo "Starting Anvil on port $PORT..."
PATH="$HOME/.foundry/bin:$PATH" anvil --port "$PORT" --host 0.0.0.0 > "$LOG_FILE" 2>&1 &
ANVIL_PID=$!

echo "$ANVIL_PID" > "$PID_FILE"
echo "Anvil started (PID: $ANVIL_PID, logs: $LOG_FILE)"
echo "To stop: ./scripts/stop_anvil.sh"