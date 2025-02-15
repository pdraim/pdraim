/**
 * Utility to initialize an SSE connection after ensuring the session cookie is present.
 * This helps avoid unauthenticated SSE requests that trigger rate limiting on the server.
 */

export function initSSE(url: string, maxRetries: number = 5, retryDelay: number = 500): Promise<EventSource> {
    return new Promise((resolve, reject) => {
        let attempt = 0;
        const tryConnect = () => {
            if (document.cookie.includes('session=')) {
                console.debug('Session cookie found, initializing SSE connection');
                const eventSource = new EventSource(url);
                resolve(eventSource);
            } else {
                attempt++;
                console.debug(`Session cookie not found. Attempt ${attempt} of ${maxRetries}, retrying in ${retryDelay}ms...`);
                if (attempt >= maxRetries) {
                    reject(new Error('Session cookie not found after maximum retries'));
                } else {
                    setTimeout(tryConnect, retryDelay);
                }
            }
        };
        tryConnect();
    });
} 