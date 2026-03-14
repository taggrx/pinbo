# Pinboard

Pinboard is a social pinboard implemented on top of Ethereum.
Users can post simple text messages and the frontend displays them.
Messages are going top to bottom.

## Technical details

The smart contract serving as the backend simple posts all messages as logs.
The frontend listens to the logs and displays them in the correct order.
The frontend also allows users to post messages by sending transactions to the smart contract.

## Project Tracking

- [MILESTONES.md](./MILESTONES.md): Detailed implementation plan with three milestones

## Working instructions

- never create commits yourself
