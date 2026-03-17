# PINBO: a public pin board

Pinbo is a simple public pinboard that uses **exclusively** Ethereum infrastructure to operate.
It is based on a smart contract with immutable logic and an immutable frontend deployed to IPFS.
Pinbo messages are fully _immutable and censorship-resistant_, as they are stored on Ethereum nodes and cannot be altered or deleted.
Pinbo only requires `$ETH` token to post.

## How it works

A user can create a post by sending a transaction to the Pinbo contract.
The Pinbo contract will emit an event with the post content.
The Pinbo app will listen to the events emitted by the Pinbo contract and display the posts in a feed.
Each post will have its own permalink that can be shared with others.

## Message Format

The contract accepts raw `bytes` and is format-agnostic. The official client uses the following encoding:

### v1 format (current)

```
0x01 | msgpack({ message: bytes, topic: bytes | null })
```

- **Version byte** `0x01` — identifies the v1 format
- **`message`** — the UTF-8 message text, pako-deflated if compression reduces size, otherwise raw UTF-8 bytes
- **`topics`** — array of tagged references, or `null` for top-level posts. Each entry is a 2-element array `[type_id, bytes]`:

  | `type_id` | Meaning  | `bytes`               |
  |-----------|----------|-----------------------|
  | `0`       | Repost   | 32-byte tx hash       |
  | `1`       | Address  | 20-byte address       |

  A message can have multiple topics. New type IDs can be added in future versions.

Threading is a client-side convention — there is no special contract support.

### Legacy format

Messages without a `0x01` prefix are raw bytes — either pako-deflated UTF-8 or plain UTF-8. Clients should try pako-inflate first, then fall back to raw UTF-8 decode. Legacy messages have no topic.

> `0x01` is safe as a version prefix: pako-compressed data always starts with `0x78` (zlib header), and valid UTF-8 text never starts with `0x01`.

## Cost

The cost of creating a post is the gas fee for sending a transaction to the Pinbo contract.
The gas fee will depend on the current network congestion and the complexity of the post content.
Additionally, the Pinbo app charges a small fee (currently `0.000025` ETH) for each post to fund future development.
