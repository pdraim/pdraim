import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// Define which console methods to strip based on LOG_LEVEL
const getConsoleFuncsToStrip = (logLevel: string) => {
	switch (logLevel?.toLowerCase()) {
		case 'error':
			return ['console.log', 'console.info', 'console.debug', 'console.warn'];
		case 'warn':
			return ['console.log', 'console.info', 'console.debug'];
		case 'info':
			return ['console.debug'];
		case 'debug':
		default:
			return [];
	}
};

export default defineConfig(({ mode }) => {
	// Load env file based on `mode` value. mode can be 'development', 'production', etc.
	const env = loadEnv(mode, process.cwd(), '');
	console.log(`Building with LOG_LEVEL=${env.LOG_LEVEL || 'info'} in ${mode} mode`);

	return {
		plugins: [sveltekit()],
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		},
		build: {
			minify: 'terser',
			terserOptions: {
				compress: {
					pure_funcs: getConsoleFuncsToStrip(env.LOG_LEVEL || 'info')
				}
			},
		}
	};
});
