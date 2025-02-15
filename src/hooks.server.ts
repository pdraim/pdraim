import type { Handle } from "@sveltejs/kit";
import { validateSessionToken } from "$lib/api/session.server";
import { setSessionTokenCookie, deleteSessionTokenCookie } from "$lib/api/session.cookie";
import { initializeDatabase } from "$lib/db/db.server";
import db from "$lib/db/db.server";
import { handleRateLimit } from "$lib/api/rate-limiter";
import { users } from "$lib/db/schema";
import { initializeMessageCache } from "$lib/cache/initialize-cache";

async function setAllUsersOffline() {
    try {
        console.log("Setting all users to offline status...");
        await db.update(users)
            .set({ 
                status: "offline"
            });
        console.log("Successfully set all users to offline status");
    } catch (error) {
        console.error("Failed to set users offline:", error);
    }
}

// Initialize database when the server starts
console.debug("Initializing database on server start...");
initializeDatabase()
    .then(async () => {
        await setAllUsersOffline();
        await initializeMessageCache();
    })
    .catch(error => {
        console.error('Failed to initialize database:', error);
    });

export const handle: Handle = async ({ event, resolve }) => {
    console.debug("Handling request:", event.url.pathname);
    
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
        console.debug("Public request accessed:", event.url.pathname);
        event.locals.user = null;
        event.locals.session = null; // Public access doesn't require a session
        const response = await resolve(event);
        return addDebugHeaders(response);
    }
    
    // Handle public routes: if token exists, validate and propagate
    if (publicRoutes.includes(event.url.pathname)) {
        console.debug("Public route accessed:", event.url.pathname);
        if (token) {
            const { session, user } = await validateSessionToken(token);
            if (session !== null) {
                console.debug("Valid session found on public route for user:", user?.nickname);
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
        console.debug("No session token found");
        event.locals.user = null;
        event.locals.session = null;
        const response = new Response("Unauthorized", { status: 401 });
        return addDebugHeaders(response);
    }
    
    const { session, user } = await validateSessionToken(token);
    if (session !== null) {
        console.debug("Valid session found for user:", user?.nickname);
        setSessionTokenCookie(event, token, session.expiresAt);
        event.locals.session = session;
        event.locals.user = user;
    } else {
        console.debug("Invalid session token");
        deleteSessionTokenCookie(event);
        event.locals.session = null;
        event.locals.user = null;
        const response = new Response("Unauthorized", { status: 401 });
        return addDebugHeaders(response);
    }
    
    // After authentication, ensure SSE endpoint does not trigger rate limiting
    if (event.url.pathname.startsWith('/api/sse') && !event.locals.user) {
        console.debug("SSE endpoint accessed without valid session, returning 401 without rate limiting");
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