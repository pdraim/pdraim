import type { RequestHandler } from './$types';
import { sseEmitter } from '$lib/sseEmitter';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';

console.debug('SSE connection initiated');

// Constants for timeout checks
const ONLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

// Initialize periodic check for timed out users
const timeoutInterval = setInterval(async () => {
    const timeoutThreshold = Date.now() - ONLINE_TIMEOUT_MS;
    console.debug('Checking for timed out users, threshold:', new Date(timeoutThreshold));

    try {
        // Find and update users who are marked as online but haven't been seen recently
        const now = Date.now();
        const result = await db.update(users)
            .set({ 
                status: 'offline',
                lastSeen: now
            })
            .where(
                and(
                    eq(users.status, 'online'),
                    lt(users.lastSeen, timeoutThreshold)
                )
            )
            .returning({ id: users.id });

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
            console.debug('User timed out and marked offline:', user.id);
        });
    } catch (error) {
        console.debug('Error during timeout check:', error);
    }
}, CHECK_INTERVAL_MS);

// Ensure the interval is cleared if the module is reloaded
process.on('beforeExit', () => {
    if (timeoutInterval) clearInterval(timeoutInterval);
});

export const GET: RequestHandler = async ({ locals }) => {
    if (!locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userId = locals.user.id;
    const encoder = new TextEncoder();
    let keepAliveInterval: ReturnType<typeof setInterval>;
    let onSSE: ((event: { type: string; data: unknown }) => void) | undefined;

    // Update user status to online and lastSeen timestamp when establishing connection
    const now = Date.now();
    await db.update(users)
        .set({ 
            status: 'online',
            lastSeen: now 
        })
        .where(eq(users.id, userId));

    // Broadcast the status update
    sseEmitter.emit('sse', {
        type: 'userStatusUpdate',
        data: {
            userId,
            status: 'online',
            lastSeen: now
        }
    });

    const stream = new ReadableStream({
        start(controller) {
            const sendEvent = (event: { type: string; data: unknown }) => {
                try {
                    const payload = `event: ${event.type}\n` +
                                    `data: ${JSON.stringify(event.data)}\n\n`;
                    controller.enqueue(encoder.encode(payload));
                    console.debug('Sent SSE event:', event);
                } catch (err) {
                    console.debug('Error sending SSE event:', err);
                }
            };

            onSSE = (event: { type: string; data: unknown }) => {
                sendEvent(event);
            };

            sseEmitter.addListener('sse', onSSE);
            console.debug('Added SSE listener');

            // Send initial connection message
            controller.enqueue(encoder.encode('data: Connected\n\n'));

            // Keep connection alive and update lastSeen: send a comment every 20 seconds
            keepAliveInterval = setInterval(async () => {
                controller.enqueue(encoder.encode(':\n\n'));
                // Update lastSeen timestamp on each keepalive
                await db.update(users)
                    .set({ lastSeen: Date.now() })
                    .where(eq(users.id, userId));
            }, 20000);
        },
        async cancel(reason) {
            if (keepAliveInterval) clearInterval(keepAliveInterval);
            if (onSSE) sseEmitter.removeListener('sse', onSSE);
            console.debug('SSE connection cancelled:', reason);

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