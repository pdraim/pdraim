import type { RequestHandler } from '@sveltejs/kit';
import type { LoginResponseSuccess, LoginResponseError } from '$lib/types/payloads';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '$lib/utils/password';
import { generateSessionToken, createSession } from '$lib/api/session.server';
import { setSessionTokenCookie } from '$lib/api/session.cookie';

// In-memory map to track failed login attempts per IP
const loginAttempts = new Map<string, { count: number, lastAttempt: number }>();
const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cleanup old entries every hour
setInterval(() => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    for (const [ip, data] of loginAttempts.entries()) {
        if (now - data.lastAttempt > ONE_HOUR) {
            loginAttempts.delete(ip);
        }
    }
}, 60 * 60 * 1000);

export const POST: RequestHandler = async ({ request, cookies }) => {
    console.log("[Login] New login attempt received");

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' } as LoginResponseError), { status: 405 });
    }

    // Get the IP address for rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const maskedIp = ip.split('.').map((octet, idx) => idx < 3 ? 'xxx' : octet).join('.');
    const now = Date.now();
    const attemptData = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };

    // If the user has failed three or more times, apply exponential backoff
    if (attemptData.count >= MAX_ATTEMPTS) {
        const delay = Math.pow(2, attemptData.count - MAX_ATTEMPTS + 1) * 1000; // delay in milliseconds
        console.log(`[Login] Rate limit exceeded for IP ${maskedIp} - applying ${delay}ms delay`);
        await sleep(delay);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        console.log("[Login] Invalid JSON payload received");
        return new Response(JSON.stringify({ error: 'Invalid JSON' } as LoginResponseError), { status: 400 });
    }

    const { username, password } = body as { username: string, password: string };

    if (typeof username !== 'string' || typeof password !== 'string') {
        console.log("Missing or invalid input fields", { username, password });
        return new Response(JSON.stringify({ error: 'Missing or invalid input fields' } as LoginResponseError), { status: 400 });
    }

    // Find user by username
    const user = await db.query.users.findFirst({
        where: eq(users.nickname, username.trim())
    });

    if (!user) {
        attemptData.count++;
        attemptData.lastAttempt = now;
        loginAttempts.set(ip, attemptData);
        console.log(`[Login] Login failed for IP ${maskedIp}. Attempt count: ${attemptData.count}`);
        const remaining = Math.max(0, MAX_ATTEMPTS - attemptData.count);
        return new Response(JSON.stringify({ 
            error: `Invalid username or password. ${remaining > 0 ? remaining + " attempt(s) remaining." : "Please wait before trying again."}` 
        } as LoginResponseError), { status: 401 });
    }

    // Verify password
    try {
        const isValid = await verifyPassword(password.trim(), user.password);
        if (!isValid) {
            attemptData.count++;
            attemptData.lastAttempt = now;
            loginAttempts.set(ip, attemptData);
            console.log(`[Login] Login failed for IP ${maskedIp}. Attempt count: ${attemptData.count}`);
            const remaining = Math.max(0, MAX_ATTEMPTS - attemptData.count);
            return new Response(JSON.stringify({ 
                error: `Invalid username or password. ${remaining > 0 ? remaining + " attempt(s) remaining." : "Please wait before trying again."}` 
            } as LoginResponseError), { status: 401 });
        }
    } catch {
        console.log("[Login] Error verifying password");
        return new Response(JSON.stringify({ error: 'Internal Server Error' } as LoginResponseError), { status: 500 });
    }

    // Reset login attempt data on success
    loginAttempts.delete(ip);

    // Generate session token and create session
    const token = generateSessionToken();
    const session = await createSession(token, user.id);

    // Update user status to online
    await db.update(users)
        .set({ 
            status: 'online',
            lastSeen: Date.now()
        })
        .where(eq(users.id, user.id));

    // Set session cookie
    setSessionTokenCookie({ cookies }, token, session.expiresAt);

    return new Response(JSON.stringify({ 
        success: true,
        user: {
            id: user.id,
            nickname: user.nickname,
            status: 'online',
            avatarUrl: user.avatarUrl,
            lastSeen: Date.now()
        }
    } as LoginResponseSuccess), { 
        status: 200 
    });
}; 