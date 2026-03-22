import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e/specs',
	timeout: 60_000,
	retries: 1,
	use: {
		baseURL: 'http://localhost:8080',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	globalSetup: './e2e/global-setup.ts',
	globalTeardown: './e2e/global-teardown.ts',
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	reporter: [['list'], ['html', { open: 'never' }]],
});
