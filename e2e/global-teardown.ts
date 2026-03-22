import { readFileSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), 'e2e', '.test-config.json');

export default async function globalTeardown() {
	try {
		const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as {
			anvilPid?: number;
			frontendPid?: number;
		};
		if (config.frontendPid) {
			process.kill(config.frontendPid, 'SIGTERM');
			console.log('[e2e:teardown] Frontend stopped.');
		}
		if (config.anvilPid) {
			process.kill(config.anvilPid, 'SIGTERM');
			console.log('[e2e:teardown] Anvil stopped.');
		}
	} catch (e) {
		console.error('[e2e:teardown] Failed to stop Anvil:', e);
	}
}
