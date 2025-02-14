import type { RequestEvent } from '@sveltejs/kit';

const isDev = import.meta.env.DEV;

// Rate limit configuration by endpoint type
const RATE_LIMITS = {
    // Authentication endpoints (login, register)
    auth: { 
        points: isDev ? 1000 : 20, 
        durationMs: 5 * 60 * 1000 
    },
    
    // Public endpoints (public chat, rooms)
    public: { 
        points: isDev ? 1000 : 30, 
        durationMs: 60 * 1000 
    },
    
    // Protected endpoints (authenticated API calls)
    protected: { 
        points: isDev ? 1000 : 100, 
        durationMs: 60 * 1000 
    },
    
    // SSE endpoints - separate limits for authenticated and unauthenticated users
    sse: {
        authenticated: { 
            points: isDev ? 1000 : 500,
            durationMs: 60 * 1000 
        },
        unauthenticated: { 
            points: 0,
            durationMs: 60 * 1000 
        }
    }
} as const;

// In-memory store for rate limiting
const ipRequests = new Map<string, Array<{ timestamp: number }>>();

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipRequests.entries()) {
        // Remove entries older than the maximum duration we care about (5 minutes)
        const filtered = timestamps.filter(t => now - t.timestamp < 5 * 60 * 1000);
        if (filtered.length === 0) {
            ipRequests.delete(ip);
        } else {
            ipRequests.set(ip, filtered);
        }
    }
}, 5 * 60 * 1000);

function getEndpointType(pathname: string, isPublic: boolean): keyof typeof RATE_LIMITS {
    if (pathname.startsWith('/api/session/login') || pathname.startsWith('/api/register')) {
        return 'auth';
    }
    if (pathname.startsWith('/api/sse')) {
        return 'sse';
    }
    if (isPublic) {
        return 'public';
    }
    return 'protected';
}

function isRateLimited(ip: string, endpointType: keyof typeof RATE_LIMITS, isAuthenticated: boolean = false): { limited: boolean; retryAfter?: number } {
    // Skip rate limiting completely in development for localhost
    if (isDev && (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost')) {
        return { limited: false };
    }

    const now = Date.now();
    
    // Handle SSE endpoints differently based on authentication status
    if (endpointType === 'sse') {
        const config = isAuthenticated ? RATE_LIMITS.sse.authenticated : RATE_LIMITS.sse.unauthenticated;
        const { points, durationMs } = config;
        
        // Get or initialize request history for this IP
        const requests = ipRequests.get(ip) || [];
        
        // Clean old requests outside the window
        const validRequests = requests.filter(req => now - req.timestamp < durationMs);
        
        // Check if we're over the limit
        if (validRequests.length >= points) {
            console.debug(`Rate limit exceeded for IP ${ip} on ${endpointType} endpoint (${isAuthenticated ? 'authenticated' : 'unauthenticated'})`);
            const oldestRequest = validRequests[0];
            const retryAfter = durationMs - (now - oldestRequest.timestamp);
            return { limited: true, retryAfter };
        }
        
        // Add this request
        validRequests.push({ timestamp: now });
        ipRequests.set(ip, validRequests);
        
        return { limited: false };
    }
    
    // Handle other endpoints
    const { points, durationMs } = RATE_LIMITS[endpointType];
    const requests = ipRequests.get(ip) || [];
    const validRequests = requests.filter(req => now - req.timestamp < durationMs);
    
    console.debug(`Rate limit check for ${ip} on ${endpointType}: ${validRequests.length}/${points} requests in the last ${durationMs/1000}s`);
    
    if (validRequests.length >= points) {
        const oldestRequest = validRequests[0];
        const retryAfter = durationMs - (now - oldestRequest.timestamp);
        return { limited: true, retryAfter };
    }
    
    validRequests.push({ timestamp: now });
    ipRequests.set(ip, validRequests);
    
    return { limited: false };
}

export async function handleRateLimit(event: RequestEvent): Promise<Response | null> {
    const ip = event.getClientAddress();
    const url = new URL(event.request.url);
    const isPublic = url.searchParams.get('public') === 'true';
    const isAuthenticated = Boolean(event.locals.user);
    
    // Skip rate limiting for non-API routes
    if (!url.pathname.startsWith('/api')) {
        return null;
    }
    
    const endpointType = getEndpointType(url.pathname, isPublic);
    const { limited, retryAfter } = isRateLimited(ip, endpointType, isAuthenticated);
    
    if (limited) {
        console.debug(`Rate limit hit for ${ip} on ${url.pathname} (${endpointType})`);
        
        // Construct a user-friendly error message
        let errorMessage = 'Too many requests. ';
        if (endpointType === 'sse') {
            errorMessage += isAuthenticated 
                ? 'Please wait before attempting to reconnect to the chat.'
                : 'Please wait before attempting to view the public chat again.';
        } else if (endpointType === 'auth') {
            errorMessage += 'Please wait before attempting to log in again.';
        } else {
            errorMessage += 'Please try again later.';
        }

        return new Response(JSON.stringify({
            error: errorMessage,
            retryAfter: Math.ceil((retryAfter || 0) / 1000),
            endpointType,
            isAuthenticated
        }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': Math.ceil((retryAfter || 0) / 1000).toString()
            }
        });
    }
    
    return null;
} 