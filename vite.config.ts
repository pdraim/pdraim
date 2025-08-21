import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * Logging configuration
 * This project uses two logging systems:
 * 1. Console logging (development/client-side) - controlled by console stripping
 * 2. Pino logging (server-side) - controlled by LOG_LEVEL
 * 
 * LOG_LEVEL affects both systems:
 * - error: only error logs
 * - warn: warn and error logs
 * - info: info, warn, and error logs (default in production)
 * - debug: all logs (default in development)
 */

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
	// Load env file based on `mode` value
	const env = loadEnv(mode, process.cwd(), '');
	const logLevel = env.LOG_LEVEL || (mode === 'development' ? 'debug' : 'info');
	
	console.log(`Building with LOG_LEVEL=${logLevel} in ${mode} mode`);

	return {
		plugins: [tailwindcss(), sveltekit()],
		test: {
			include: ['src/**/*.{test,spec}.{js,ts}']
		},
		build: {
			minify: 'terser',
			terserOptions: {
				compress: {
					// Strip console methods based on LOG_LEVEL
					pure_funcs: getConsoleFuncsToStrip(logLevel)
				}
			},
		},
		// Make LOG_LEVEL available to client-side code
		define: {
			'process.env.LOG_LEVEL': JSON.stringify(logLevel)
		}
	};
});
