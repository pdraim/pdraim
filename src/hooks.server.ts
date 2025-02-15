import type { Handle } from "@sveltejs/kit";
import { validateSessionToken } from "$lib/api/session.server";
import { setSessionTokenCookie, deleteSessionTokenCookie } from "$lib/api/session.cookie";
import { initializeDatabase } from "$lib/db/db.server";
import db from "$lib/db/db.server";
import { handleRateLimit } from "$lib/api/rate-limiter";
import { users } from "$lib/db/schema";
import { initializeMessageCache } from "$lib/cache/initialize-cache";
import { createLogger } from "$lib/utils/logger.server";
import { ensureDefaultChatRoom } from "$lib/utils/chat.server";

const log = createLogger('hooks-server');

async function setAllUsersOffline() {
    try {
        log.info("Setting all users to offline status...");
        await db.update(users)
            .set({ 
                status: "offline"
            });
        log.info("Successfully set all users to offline status");
    } catch (error) {
        log.error("Failed to set users offline", { error });
    }
}

// Initialize database when the server starts
log.debug("Initializing database on server start...");
initializeDatabase()
    .then(async () => {
        await ensureDefaultChatRoom(db);
        await setAllUsersOffline();
        await initializeMessageCache();
    })
    .catch(error => {
        log.error('Failed to initialize database', { error });
    });

export const handle: Handle = async ({ event, resolve }) => {
    log.debug("Handling request", { path: event.url.pathname });
    
    // Identify public chat and room requests
    const isPublicChatRequest = 
        event.url.pathname === '/api/chat/messages' && 
        event.url.searchParams.get('public') === 'true' &&
        event.request.method === 'GET';
    const isPublicRoomRequest = 
        event.url.pathname.startsWith('/api/rooms/') && 
        event.url.searchParams.get('public') === 'true' &&
        event.request.method === 'GET';
    
    // Public routes that don't require authentication (removed '/api/sse' here)
    const publicRoutes = [
        "/",
        "/api/session/login",
        "/api/session/validate",
        "/api/register",
        "/login",
        "/register"
    ];
    
    // Get session token from cookies
    const token = event.cookies.get("session") ?? null;
    
    // Function to add debug headers for SSE requests
    const addDebugHeaders = (response: Response) => {
        if (event.url.pathname.startsWith('/api/sse')) {
            response.headers.set('X-Debug-Has-Token', Boolean(token).toString());
            response.headers.set('X-Debug-Token-Length', token ? token.length.toString() : '0');
            response.headers.set('X-Debug-Cookie-Count', event.cookies.getAll().length.toString());
        }
        return response;
    };

    // Handle public chat/room requests
    if (isPublicChatRequest || isPublicRoomRequest) {
        log.debug("Public request accessed", { path: event.url.pathname });
        event.locals.user = null;
        event.locals.session = null; // Public access doesn't require a session
        const response = await resolve(event);
        return addDebugHeaders(response);
    }
    
    // Handle public routes: if token exists, validate and propagate
    if (publicRoutes.includes(event.url.pathname)) {
        log.debug("Public route accessed", { path: event.url.pathname });
        if (token) {
            const { session, user } = await validateSessionToken(token);
            if (session !== null) {
                log.debug("Valid session found on public route", { user: user?.nickname });
                setSessionTokenCookie(event, token, session.expiresAt);
                event.locals.session = session;
                event.locals.user = user;
            }
        }
        const response = await resolve(event);
        return addDebugHeaders(response);
    }
    
    // Protected routes: ensure authentication
    if (token === null) {
        log.debug("No session token found");
        event.locals.user = null;
        event.locals.session = null;
        const response = new Response("Unauthorized", { status: 401 });
        return addDebugHeaders(response);
    }
    
    const { session, user } = await validateSessionToken(token);
    if (session !== null) {
        log.debug("Valid session found", { user: user?.nickname });
        setSessionTokenCookie(event, token, session.expiresAt);
        event.locals.session = session;
        event.locals.user = user;
    } else {
        log.debug("Invalid session token");
        deleteSessionTokenCookie(event);
        event.locals.session = null;
        event.locals.user = null;
        const response = new Response("Unauthorized", { status: 401 });
        return addDebugHeaders(response);
    }
    
    // After authentication, ensure SSE endpoint does not trigger rate limiting
    if (event.url.pathname.startsWith('/api/sse') && !event.locals.user) {
        log.debug("SSE endpoint accessed without valid session, returning 401 without rate limiting");
        return addDebugHeaders(new Response("Unauthorized", { status: 401 }));
    }

    // For any request without an authenticated user, apply rate limiting
    if (!event.locals.user) {
        const rateLimitResponse = await handleRateLimit(event);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }
    }
    
    const response = await resolve(event);
    return addDebugHeaders(response);
}; 