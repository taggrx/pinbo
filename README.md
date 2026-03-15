# PINBO: a public pin board

Pinbo is a simple public pinboard that uses exclusively Ethereum infrastructure to operate.
It is based on a smart contract with immutable logic and an immutable frontend deployed to IPFS.
Pinbo messages are fully immutable and censorship-resistant, as they are stored on Ethereum nodes and cannot be altered or deleted.
Pinbo only requires $ETH token to post.

## How it works

A user can create a post by sending a transaction to the Pinbo contract.
The Pinbo contract will emit an event with the post content.
The Pinbo app will listen to the events emitted by the Pinbo contract and display the posts in a feed.
Each post will have its own permalink that can be shared with others.

## Cost

The cost of creating a post is the gas fee for sending a transaction to the Pinbo contract.
The gas fee will depend on the current network congestion and the complexity of the post content.
Additionally, the Pinbo app charges a small fee (currently 0.0001 ETH) for each post to fund future development.
