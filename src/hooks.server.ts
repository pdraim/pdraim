import type { Handle } from "@sveltejs/kit";
import db from "$lib/db/db.server";
import { handleRateLimit } from "$lib/api/rate-limiter";
import { users } from "$lib/db/schema";
import { createLogger } from "$lib/utils/logger.server";
import { ensureDefaultChatRoom } from "$lib/utils/chat.server";

const log = createLogger('hooks-server');

// Set all users to offline on server start
async function setAllUsersOffline() {
    try {
        const now = Date.now();
        await db.update(users)
            .set({ status: 'offline', lastSeen: now });
        log.info('All users set to offline on server start');
    } catch (error: unknown) {
        log.error('Failed to set users offline on server start:', { error });
    }
}

// Initialize server
Promise.resolve()
    .then(async () => {
        log.info('Initializing server...');
        await ensureDefaultChatRoom(db);
        await setAllUsersOffline();
        log.info('Server initialized successfully');
    })
    .catch((error: unknown) => {
        log.error('Failed to initialize server:', { error });
        process.exit(1);
    });

export const handle: Handle = async ({ event, resolve }) => {
    log.debug("Handling request", { path: event.url.pathname });
    
    // Identify public chat and room requests
    const isPublicChatRequest = event.url.pathname.startsWith('/api/chat/messages') && event.request.method === 'GET';
    const isPublicRoomRequest = event.url.pathname.startsWith('/api/rooms') && event.request.method === 'GET';
    
    // Skip rate limiting for public endpoints
    if (!isPublicChatRequest && !isPublicRoomRequest) {
        const rateLimitResult = await handleRateLimit(event);
        if (rateLimitResult?.status === 429) {
            return new Response('Too Many Requests', {
                status: 429,
                headers: {
                    'Retry-After': '60'
                }
            });
        }
    }

    const response = await resolve(event);
    return response;
}; 