import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseAbiItem,
  bytesToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import pako from 'pako';

// CONFIG_PATH is resolved at runtime relative to process.cwd() (the Playwright root).
// This avoids issues with esbuild's import.meta.url pointing to a temp bundle directory.
const CONFIG_PATH = join(process.cwd(), 'e2e', '.test-config.json');

// ---------------------------------------------------------------------------
// Test config (written by global-setup.ts)
// ---------------------------------------------------------------------------
export const testConfig = JSON.parse(
  readFileSync(CONFIG_PATH, 'utf8'),
) as {
  anvilPid: number;
  contractAddress: `0x${string}`;
  deployBlock: number;
  rpcUrl: string;
  chainId: number;
  aliceAddress: `0x${string}`;
  aliceKey: `0x${string}`;
  bobAddress: `0x${string}`;
  bobKey: `0x${string}`;
};

const pinboAbi = parseAbi([
  'function fee() view returns (uint256)',
  'function latestMessageBlock() view returns (uint256)',
  'function postMessage(bytes message) payable',
  'event MessagePosted(address indexed sender, bytes message, uint256 timestamp)',
]);

const MESSAGE_EVENT = parseAbiItem(
  'event MessagePosted(address indexed sender, bytes message, uint256 timestamp)',
);

export const TOPIC_TYPE = { REPOST: 0, ADDRESS: 1 } as const;
const VERSION_BYTE = 0x01;

// ---------------------------------------------------------------------------
// Message encoding (mirrors ethereum.ts for Node-side test helpers)
// ---------------------------------------------------------------------------
export function encodeMessage(
  text: string,
  topics: Array<[number, Uint8Array]> | null = null,
): Uint8Array {
  const textBytes = new TextEncoder().encode(text.trim());
  const compressed = pako.deflate(textBytes, { level: 9 });
  const messageBytes =
    compressed.length < textBytes.length ? compressed : textBytes;
  const packed = msgpackEncode(
    topics ? { message: messageBytes, topics } : { message: messageBytes },
  );
  const result = new Uint8Array(1 + packed.length);
  result[0] = VERSION_BYTE;
  result.set(packed, 1);
  return result;
}

// ---------------------------------------------------------------------------
// Viem clients for Node-side chain interaction
// ---------------------------------------------------------------------------
const testChain = {
  id: testConfig.chainId,
  name: 'TestAnvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [testConfig.rpcUrl] } },
} as const;

export const publicClient = createPublicClient({
  chain: testChain,
  transport: http(testConfig.rpcUrl),
});

export const aliceClient = createWalletClient({
  account: privateKeyToAccount(testConfig.aliceKey),
  chain: testChain,
  transport: http(testConfig.rpcUrl),
});

export const bobClient = createWalletClient({
  account: privateKeyToAccount(testConfig.bobKey),
  chain: testChain,
  transport: http(testConfig.rpcUrl),
});

// ---------------------------------------------------------------------------
// Node-side message posting (bypasses the UI, used to seed data)
// ---------------------------------------------------------------------------
export async function postMessageNode(
  walletClient: typeof aliceClient | typeof bobClient,
  text: string,
  topics: Array<[number, Uint8Array]> | null = null,
): Promise<`0x${string}`> {
  const fee = (await publicClient.readContract({
    address: testConfig.contractAddress,
    abi: pinboAbi,
    functionName: 'fee',
  })) as bigint;

  const dataHex = bytesToHex(encodeMessage(text, topics));

  // Retry on nonce conflicts caused by parallel test execution
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const hash = await walletClient.writeContract({
        address: testConfig.contractAddress,
        abi: pinboAbi,
        functionName: 'postMessage',
        args: [dataHex],
        value: fee,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (err) {
      const msg = String(err);
      if (attempt < 4 && (msg.includes('nonce') || msg.includes('replacement transaction'))) {
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('postMessageNode: all retries exhausted');
}

/** Fetches the MessagePosted log for a given tx hash. */
export async function getMessageEvent(txHash: `0x${string}`) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  const logs = await publicClient.getLogs({
    address: testConfig.contractAddress,
    event: MESSAGE_EVENT,
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber,
  });
  return logs.find((l) => l.transactionHash === txHash) ?? null;
}

// ---------------------------------------------------------------------------
// Mock provider helpers
// ---------------------------------------------------------------------------
export type TestWallet = {
  address: `0x${string}`;
  privateKey: `0x${string}`;
  providerScript: string;
};

function buildMockProviderScript(
  account: string,
  chainIdHex: string,
  rpcUrl: string,
): string {
  const template = readFileSync(
    join(process.cwd(), 'e2e', 'mock-provider.js'),
    'utf8',
  );
  return template
    .replace(/__ACCOUNT__/g, account)
    .replace(/__CHAIN_ID_HEX__/g, chainIdHex)
    .replace(/__RPC_URL__/g, rpcUrl);
}

const chainIdHex = `0x${testConfig.chainId.toString(16)}`;

export const aliceWallet: TestWallet = {
  address: testConfig.aliceAddress,
  privateKey: testConfig.aliceKey,
  providerScript: buildMockProviderScript(
    testConfig.aliceAddress,
    chainIdHex,
    testConfig.rpcUrl,
  ),
};

export const bobWallet: TestWallet = {
  address: testConfig.bobAddress,
  privateKey: testConfig.bobKey,
  providerScript: buildMockProviderScript(
    testConfig.bobAddress,
    chainIdHex,
    testConfig.rpcUrl,
  ),
};

// ---------------------------------------------------------------------------
// IDB clear helper (runs in the browser context)
// ---------------------------------------------------------------------------
async function clearIdb(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('pinbo');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      }),
  );
}

// ---------------------------------------------------------------------------
// Page setup — inject provider + preferences, clear IDB, then yield.
// Tests call page.goto('/') themselves (after any Node-side data seeding).
// ---------------------------------------------------------------------------
async function setupPage(page: Page, wallet: TestWallet) {
  await page.addInitScript(wallet.providerScript);
  // Use markdown mode so TuiEditor renders a plain <textarea> instead of ProseMirror.
  await page.addInitScript(() => {
    localStorage.setItem('pinbo_editor_mode', 'markdown');
  });
  // Navigate to the app origin once so we can clear its IndexedDB.
  await page.goto('/');
  await clearIdb(page);
}

// ---------------------------------------------------------------------------
// Custom test fixtures
// ---------------------------------------------------------------------------
type Fixtures = {
  /** Page with Alice's wallet injected and IDB cleared. Call page.goto('/') to load. */
  alicePage: Page;
  /** Page with Bob's wallet injected and IDB cleared. Call page.goto('/') to load. */
  bobPage: Page;
};

export const test = base.extend<Fixtures>({
  alicePage: async ({ page }, use) => {
    await setupPage(page, aliceWallet);
    await use(page);
  },
  bobPage: async ({ page }, use) => {
    await setupPage(page, bobWallet);
    await use(page);
  },
});

export { expect };
