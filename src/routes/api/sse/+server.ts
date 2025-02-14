import type { RequestHandler } from './$types';
import { sseEmitter } from '$lib/sseEmitter';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';

console.log('[SSE] Server initialized');

// Constants for timeout checks
const ONLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

let timeoutInterval: ReturnType<typeof setInterval>;

// Initialize periodic check for timed out users
function startTimeoutCheck() {
    if (timeoutInterval) {
        clearInterval(timeoutInterval);
    }

    timeoutInterval = setInterval(async () => {
        const timeoutThreshold = Date.now() - ONLINE_TIMEOUT_MS;
        console.log('[SSE] Checking for timed out users', { 
            checkTime: new Date().toISOString(),
            timeoutThreshold: new Date(timeoutThreshold).toISOString()
        });

        try {
            // Find and update users who haven't been seen recently
            const now = Date.now();
            const result = await db.update(users)
                .set({ 
                    status: 'offline',
                    lastSeen: now
                })
                .where(
                    and(
                        eq(users.status, 'online'), // Only update online users
                        lt(users.lastSeen, timeoutThreshold) // Who haven't been seen recently
                    )
                )
                .returning({ 
                    id: users.id,
                    nickname: users.nickname,
                    lastSeen: users.lastSeen
                });

            // Log timeout results
            if (result.length > 0) {
                console.log('[SSE] Found timed out users:', result.map(user => ({
                    nickname: user.nickname,
                    lastSeen: new Date(user.lastSeen || 0).toISOString()
                })));
            }

            // Broadcast status updates for timed out users
            result.forEach(user => {
                sseEmitter.emit('sse', {
                    type: 'userStatusUpdate',
                    data: {
                        userId: user.id,
                        status: 'offline',
                        lastSeen: now
                    }
                });
                console.log('[SSE] User timed out and marked offline:', {
                    nickname: user.nickname,
                    lastSeen: new Date(now).toISOString()
                });
            });
        } catch (error) {
            console.error('[SSE] Error during timeout check:', error);
        }
    }, CHECK_INTERVAL_MS);
}

// Start the timeout check when this module loads
startTimeoutCheck();

// Ensure the interval is cleared if the module is reloaded
if (typeof process !== 'undefined') {
    process.on('beforeExit', () => {
        if (timeoutInterval) clearInterval(timeoutInterval);
    });
    
    // Also handle SIGTERM and SIGINT
    process.on('SIGTERM', () => {
        if (timeoutInterval) clearInterval(timeoutInterval);
        process.exit(0);
    });
    
    process.on('SIGINT', () => {
        if (timeoutInterval) clearInterval(timeoutInterval);
        process.exit(0);
    });
}

export const GET: RequestHandler = async ({ request, locals, cookies }) => {
    // Add detailed debug logging for authentication state
    console.log('[SSE] Connection attempt:', {
        hasLocals: !!locals,
        hasUser: !!locals.user,
        userId: locals.user?.id,
        hasSessionCookie: !!cookies.get('session'),
        headers: Object.fromEntries(request.headers.entries())
    });

    if (!locals.user) {
        console.log('[SSE] Authentication failed - no user in locals');
        return new Response('Unauthorized', { 
            status: 401,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    const userId = locals.user.id;
    const encoder = new TextEncoder();
    let keepAliveInterval: ReturnType<typeof setInterval>;
    let onSSE: ((event: { type: string; data: unknown }) => void) | undefined;

    // Update user status to online and lastSeen timestamp when establishing connection
    const now = Date.now();
    
    try {
        await db.update(users)
            .set({ 
                status: 'online',
                lastSeen: now 
            })
            .where(eq(users.id, userId));

        console.log('[SSE] User status updated to online:', {
            userId: `${userId.slice(0, 4)}...${userId.slice(-4)}`,
            timestamp: new Date(now).toISOString()
        });

        // Broadcast the status update
        sseEmitter.emit('sse', {
            type: 'userStatusUpdate',
            data: {
                userId,
                status: 'online',
                lastSeen: now
            }
        });
    } catch (error) {
        console.error('[SSE] Error updating user status:', error);
        // Continue with SSE setup even if status update fails
    }

    const stream = new ReadableStream({
        start(controller) {
            const sendEvent = (event: { type: string; data: unknown }) => {
                try {
                    const payload = `event: ${event.type}\n` +
                                    `data: ${JSON.stringify(event.data)}\n\n`;
                    controller.enqueue(encoder.encode(payload));
                    // Only log non-sensitive event types
                    if (!['userStatusUpdate', 'chatMessage'].includes(event.type)) {
                        console.log('[SSE] Event sent:', { type: event.type });
                    }
                } catch {
                    console.log('[SSE] Error sending event');
                }
            };

            onSSE = (event: { type: string; data: unknown }) => {
                sendEvent(event);
            };

            sseEmitter.addListener('sse', onSSE);
            request.signal.addEventListener('abort', () => {
                if (onSSE) {
                    sseEmitter.removeListener('sse', onSSE);
                    console.log('[SSE] Removed listener due to abort signal.');
                }
            });
            console.log('[SSE] Added new listener');

            // Send initial connection message
            controller.enqueue(encoder.encode('data: Connected\n\n'));

            // Keep connection alive and update lastSeen: send a comment every 20 seconds
            keepAliveInterval = setInterval(() => {
                controller.enqueue(encoder.encode(':\n\n'));
            }, 20000);
        },
        async cancel(reason) {
            if (keepAliveInterval) clearInterval(keepAliveInterval);
            if (onSSE) sseEmitter.removeListener('sse', onSSE);
            const maskedUserId = `${userId.slice(0, 4)}...${userId.slice(-4)}`;
            console.log('[SSE] Connection closed:', { userId: maskedUserId, reason });

            // Update user status to offline in the database
            const now = Date.now();
            await db.update(users)
                .set({ status: 'offline', lastSeen: now })
                .where(eq(users.id, userId));
            
            // Broadcast the status update
            sseEmitter.emit('sse', { 
                type: 'userStatusUpdate', 
                data: { 
                    userId, 
                    status: 'offline', 
                    lastSeen: now 
                } 
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}; 