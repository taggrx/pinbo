#!/bin/bash
# Mint 1 ETH to a wallet on local Anvil network

set -e

TARGET=${1:-0xC384CBdE68C90643d28b96b9024F7fCEB9516A9c}

# Use Anvil's default first account (has 10000 ETH) to send 1 ETH
cast send "$TARGET" --value 1ether --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

echo "Minted 1 ETH to $TARGET"
