import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const commitHash = execSync('git rev-parse --short=8 HEAD').toString().trim();

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__COMMIT_HASH__: JSON.stringify(commitHash),
	},
	build: {
		chunkSizeWarningLimit: 5000,
	},
	server: {
		port: 8080,
		host: '0.0.0.0',
		strictPort: true,
		cors: true,
	},
});
