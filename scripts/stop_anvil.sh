#!/bin/bash
# Stop Anvil local Ethereum node

PID_FILE=".anvil.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found. Is Anvil running?"
    exit 1
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm "$PID_FILE"
    echo "Anvil stopped (PID: $PID)"
else
    echo "Process $PID not found. Removing PID file."
    rm "$PID_FILE"
fi