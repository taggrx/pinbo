import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

const gitTag = process.env.GIT_TAG ||
	execSync('git describe --tags --abbrev=0 2>/dev/null || echo "untagged"').toString().trim();

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__GIT_TAG__: JSON.stringify(gitTag),
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
