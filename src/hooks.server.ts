import type { Handle } from "@sveltejs/kit";
import db from "$lib/db/db.server";
import { handleRateLimit } from "$lib/api/rate-limiter";
import { users } from "$lib/db/schema";
import { createLogger } from "$lib/utils/logger.server";
import { ensureDefaultChatRoom } from "$lib/utils/chat.server";
import { validateSessionToken } from "$lib/api/session.server";
import { setSessionTokenCookie, deleteSessionTokenCookie } from "$lib/api/session.cookie";

const log = createLogger('hooks-server');

// Set all users to offline on server start
async function setAllUsersOffline() {
    try {
        await db.update(users)
            .set({ status: 'offline'});
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
    
    // Get session token from cookies
    const token = event.cookies.get("session") ?? null;

    // Validate session token if token exists
    if (token) {
        const { session, user } = await validateSessionToken(token);
        if (session) {
            log.debug("Valid session found", { user: user?.nickname });
            setSessionTokenCookie(event, token, session.expiresAt);
            event.locals.session = session;
            event.locals.user = user;
        } else {
            log.debug("Invalid session token");
            deleteSessionTokenCookie(event);
            event.locals.session = null;
            event.locals.user = null;
        }
    }

    // Identify public chat and room requests if there is no valid session
    const isPublicChatRequest = event.url.pathname.startsWith('/api/chat/messages') && event.request.method === 'GET';
    const isPublicRoomRequest = event.url.pathname.startsWith('/api/rooms/') && event.request.method === 'GET';

    if ((isPublicChatRequest || isPublicRoomRequest) && !event.locals.session) {
        log.debug("Public request accessed", { path: event.url.pathname });
        const response = await resolve(event);
        return response;
    }
    
    // Public routes that don't require authentication
    const publicRoutes = [
        "/",
        "/api/session/login",
        "/api/session/validate",
        "/api/register",
        "/login",
        "/register"
    ];

    // Handle public routes
    if (publicRoutes.includes(event.url.pathname)) {
        log.debug("Public route accessed", { path: event.url.pathname });
        const response = await resolve(event);
        return response;
    }

    // Skip rate limiting for SSE endpoint when authenticated
    if (event.url.pathname.startsWith('/api/sse')) {
        return await resolve(event);
    }

    // Apply rate limiting for non-public endpoints
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