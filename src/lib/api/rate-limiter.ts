import type { RequestEvent } from '@sveltejs/kit';

// Rate limit configuration by endpoint type
const RATE_LIMITS = {
    // Authentication endpoints (login, register)
    auth: { points: 5, durationMs: 5 * 60 * 1000 }, // 5 requests per 5 minutes
    
    // Public endpoints (public chat, rooms)
    public: { points: 30, durationMs: 60 * 1000 }, // 30 requests per minute
    
    // Protected endpoints (authenticated API calls)
    protected: { points: 100, durationMs: 60 * 1000 }, // 100 requests per minute
    
    // SSE endpoints
    sse: { points: 2, durationMs: 60 * 1000 } // 2 connections per minute
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

function isRateLimited(ip: string, endpointType: keyof typeof RATE_LIMITS): boolean {
    const now = Date.now();
    const { points, durationMs } = RATE_LIMITS[endpointType];
    
    // Get or initialize request history for this IP
    const requests = ipRequests.get(ip) || [];
    
    // Clean old requests outside the window
    const validRequests = requests.filter(req => now - req.timestamp < durationMs);
    
    // Check if we're over the limit
    if (validRequests.length >= points) {
        console.debug(`Rate limit exceeded for IP ${ip} on ${endpointType} endpoint`);
        return true;
    }
    
    // Add this request
    validRequests.push({ timestamp: now });
    ipRequests.set(ip, validRequests);
    
    return false;
}

export async function handleRateLimit(event: RequestEvent): Promise<Response | null> {
    const ip = event.getClientAddress();
    const url = new URL(event.request.url);
    const isPublic = url.searchParams.get('public') === 'true';
    
    // Skip rate limiting for non-API routes
    if (!url.pathname.startsWith('/api')) {
        return null;
    }
    
    const endpointType = getEndpointType(url.pathname, isPublic);
    
    if (isRateLimited(ip, endpointType)) {
        console.debug(`Rate limit hit for ${ip} on ${url.pathname} (${endpointType})`);
        return new Response(JSON.stringify({
            error: 'Too many requests',
            retryAfter: Math.ceil(RATE_LIMITS[endpointType].durationMs / 1000)
        }), {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': Math.ceil(RATE_LIMITS[endpointType].durationMs / 1000).toString()
            }
        });
    }
    
    return null;
} 