import { execSync, spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

// Project root (cwd when `playwright test` is invoked)
const ROOT = process.cwd();
// Config file shared between globalSetup, globalTeardown, fixtures, and start-frontend.mjs
const CONFIG_PATH = join(ROOT, 'e2e', '.test-config.json');

export const ANVIL_PORT = 8545;
export const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
// Use mainnet chain ID (1) so the WagmiAdapter recognises the chain and wrongNetwork stays false.
export const CHAIN_ID = 1;

// Default Anvil accounts derived from the standard test mnemonic:
// "test test test test test test test test test test test junk"
export const DEPLOYER_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
export const ALICE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
export const BOB_KEY =
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const;
export const DEPLOYER_ADDRESS =
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
export const ALICE_ADDRESS =
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
export const BOB_ADDRESS =
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;

// Put ~/.foundry/bin first so the Foundry tools take precedence over any
// system binaries that happen to share a name (e.g. /usr/bin/forge).
const foundryBin = resolve(homedir(), '.foundry', 'bin');
const shellEnv = { ...process.env, PATH: `${foundryBin}:${process.env.PATH ?? ''}` };

async function jsonRpc(method: string, params: unknown[] = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as {
    result?: unknown;
    error?: { message: string };
  };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function waitForAnvil(maxMs = 10_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      await jsonRpc('eth_blockNumber');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Anvil did not become ready in time');
}

export default async function globalSetup() {
  console.log(`[e2e:setup] Starting Anvil on port ${ANVIL_PORT}...`);

  // Anvil without --block-time mines instantly on each transaction (the default).
  const anvil = spawn(
    resolve(homedir(), '.foundry', 'bin', 'anvil'),
    [
      '--port', String(ANVIL_PORT),
      '--chain-id', String(CHAIN_ID),
      '--accounts', '10',
      '--mnemonic', 'test test test test test test test test test test test junk',
      '--host', '0.0.0.0',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: false, env: shellEnv },
  );

  anvil.on('error', (e) => {
    throw new Error(`Anvil failed to start: ${e.message}`);
  });

  // Write a partial config immediately so global-teardown can kill Anvil even
  // if a later step fails.
  writeFileSync(CONFIG_PATH, JSON.stringify({ anvilPid: anvil.pid }));

  await waitForAnvil();
  console.log('[e2e:setup] Anvil ready.');

  // Deploy contract via forge
  console.log('[e2e:setup] Deploying contract...');
  const deployOutput = execSync(
    `forge script script/Deploy.s.sol:Deploy --rpc-url ${RPC_URL} --private-key ${DEPLOYER_KEY} --broadcast 2>&1`,
    { cwd: ROOT, encoding: 'utf8', env: shellEnv },
  );

  const addrMatch = deployOutput.match(/Pinbo deployed at: (0x[a-fA-F0-9]{40})/i);
  if (!addrMatch) {
    throw new Error(
      `Could not parse contract address from forge output:\n${deployOutput}`,
    );
  }
  const contractAddress = addrMatch[1];
  console.log('[e2e:setup] Contract deployed at:', contractAddress);

  // Record the deploy block so the frontend knows where to start scanning.
  const blockHex = (await jsonRpc('eth_blockNumber')) as string;
  const deployBlock = parseInt(blockHex, 16);
  console.log('[e2e:setup] Deploy block:', deployBlock);

  // Fund Alice and Bob so they can pay the posting fee.
  console.log('[e2e:setup] Funding test wallets...');
  execSync(
    `cast send --rpc-url ${RPC_URL} --private-key ${DEPLOYER_KEY} ${ALICE_ADDRESS} --value 10ether`,
    { cwd: ROOT, encoding: 'utf8', env: shellEnv },
  );
  execSync(
    `cast send --rpc-url ${RPC_URL} --private-key ${DEPLOYER_KEY} ${BOB_ADDRESS} --value 10ether`,
    { cwd: ROOT, encoding: 'utf8', env: shellEnv },
  );
  console.log('[e2e:setup] Wallets funded.');

  // Write full config for the webServer helper and individual test fixtures.
  const config = {
    anvilPid: anvil.pid,
    contractAddress,
    deployBlock,
    rpcUrl: RPC_URL,
    chainId: CHAIN_ID,
    aliceAddress: ALICE_ADDRESS,
    aliceKey: ALICE_KEY,
    bobAddress: BOB_ADDRESS,
    bobKey: BOB_KEY,
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('[e2e:setup] Setup complete.');
}
