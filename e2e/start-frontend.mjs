/**
 * Reads the test config written by global-setup and starts the Vite dev server
 * with the correct environment variables pointing at the freshly deployed contract.
 * Playwright's webServer uses this as its command and waits for port 5173 to open.
 */
import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '.test-config.json');

// globalSetup writes this file — webServer may start before it's ready, so poll.
const deadline = Date.now() + 120_000;
while (!existsSync(CONFIG_PATH) || !JSON.parse(readFileSync(CONFIG_PATH, 'utf8')).contractAddress) {
	if (Date.now() > deadline) throw new Error('Timed out waiting for .test-config.json');
	await new Promise((r) => setTimeout(r, 200));
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const env = {
	...process.env,
	VITE_PINBO_CONTRACT_ADDRESS: config.contractAddress,
	VITE_CONTRACT_DEPLOY_BLOCK: String(config.deployBlock),
	VITE_RPC_URL: config.rpcUrl,
	VITE_CHAIN_ID: String(config.chainId),
	VITE_E2E: 'true',
};

// Use the port configured in vite.config.ts (8080) rather than overriding.
const child = spawn('npm', ['run', 'dev'], {
	cwd: join(__dirname, '..', 'frontend'),
	env,
	stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
