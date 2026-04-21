import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
		},
		tsconfigPaths: true,
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.{test,spec}.{ts,tsx}', 'workspaces/**/*.{test,spec}.{ts,tsx}'],
		exclude: ['node_modules', '.next', 'dist', 'coverage'],
	},
});
