import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
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
