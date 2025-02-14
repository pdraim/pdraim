import type { Handle } from "@sveltejs/kit";
import { validateSessionToken } from "$lib/api/session.server";
import { setSessionTokenCookie, deleteSessionTokenCookie } from "$lib/api/session.cookie";
import { initializeDatabase } from "$lib/db/db.server";
import db from "$lib/db/db.server";
import { handleRateLimit } from "$lib/api/rate-limiter";
import { users } from "$lib/db/schema";

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
    })
    .catch(error => {
        console.error('Failed to initialize database:', error);
    });

export const handle: Handle = async ({ event, resolve }) => {
    console.debug("Handling request:", event.url.pathname);
    
    // Apply rate limiting for API routes
    const rateLimitResponse = await handleRateLimit(event);
    if (rateLimitResponse) {
        return rateLimitResponse;
    }
    
    // Check if this is a public chat messages request
    const isPublicChatRequest = 
        event.url.pathname === '/api/chat/messages' && 
        event.url.searchParams.get('public') === 'true' &&
        event.request.method === 'GET';
    
    // Check if this is a public room request
    const isPublicRoomRequest = 
        event.url.pathname.startsWith('/api/rooms/') && 
        event.url.searchParams.get('public') === 'true' &&
        event.request.method === 'GET';
    
    // Public routes that don't require authentication
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

    // Handle public requests separately: always clear session
    if (isPublicChatRequest || isPublicRoomRequest) {
        console.debug("Public request accessed:", event.url.pathname);
        event.locals.user = null;
        event.locals.session = null; // Public access doesn't require a session
        return resolve(event);
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
        return resolve(event);
    }

    // Protected routes: ensure authentication
    if (token === null) {
        console.debug("No session token found");
        event.locals.user = null;
        event.locals.session = null;
        return new Response("Unauthorized", { status: 401 });
    }
    
    const { session, user } = await validateSessionToken(token);
    if (session !== null) {
        console.debug("Valid session found for user:", user?.nickname);
        setSessionTokenCookie(event, token, session.expiresAt);
        event.locals.session = session;
        event.locals.user = user;
        return resolve(event);
    } else {
        console.debug("Invalid session token");
        deleteSessionTokenCookie(event);
        event.locals.session = null;
        event.locals.user = null;
        return new Response("Unauthorized", { status: 401 });
    }
}; 