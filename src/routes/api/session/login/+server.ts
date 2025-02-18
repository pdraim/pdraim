import type { RequestHandler } from '@sveltejs/kit';
import type { LoginResponseSuccess, LoginResponseError } from '$lib/types/payloads';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm/sql';
import { verifyPassword } from '$lib/utils/password';
import { generateSessionToken, createSession } from '$lib/api/session.server';
import { setSessionTokenCookie } from '$lib/api/session.cookie';
import { createSafeUser } from '$lib/types/chat';
import { createLogger } from '$lib/utils/logger.server';
import { validateTurnstileToken } from '$lib/utils/turnstile.server';

const log = createLogger('login-server');

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

// cf_clearance:"Qwq0fwt23w"
// Helper to parse clearance cookie from headers
function getClearanceCookie(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/cf-clearance=([^;]+)/);
    return match ? match[1] : null;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
    log.debug('New login attempt received');

    if (request.method !== 'POST') {
        log.warn('Invalid method used', { method: request.method });
        return new Response(JSON.stringify({ error: 'Method Not Allowed' } as LoginResponseError), { status: 405 });
    }

    // Get the IP address for rate limiting and Turnstile validation
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const maskedIp = ip.split('.').map((octet, idx) => idx < 3 ? 'xxx' : octet).join('.');
    const now = Date.now();
    const attemptData = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };

    // If the user has failed three or more times, apply exponential backoff
    if (attemptData.count >= MAX_ATTEMPTS) {
        const delay = Math.pow(2, attemptData.count - MAX_ATTEMPTS + 1) * 1000; // delay in milliseconds
        log.warn('Rate limit exceeded', { maskedIp, delay });
        await sleep(delay);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        log.warn('Invalid JSON payload received');
        return new Response(JSON.stringify({ error: 'Invalid JSON' } as LoginResponseError), { status: 400 });
    }

    const { username, password, turnstileToken } = body as { username: string, password: string, turnstileToken: string };

    if (typeof username !== 'string' || typeof password !== 'string' || typeof turnstileToken !== 'string') {
        log.warn('Missing or invalid input fields', { 
            hasUsername: typeof username === 'string',
            hasPassword: typeof password === 'string',
            hasTurnstileToken: typeof turnstileToken === 'string'
        });
        return new Response(JSON.stringify({ error: 'Missing or invalid input fields' } as LoginResponseError), { status: 400 });
    }

    // NEW: Check if a clearance cookie exists
    const cookieHeader = request.headers.get('cookie');
    const clearanceCookie = getClearanceCookie(cookieHeader);
    let isValidTurnstile = false;
    
    if (clearanceCookie) {
        // Optional: Validate the clearance cookie if needed.
        log.debug('Clearance cookie detected; bypassing token challenge.');
        isValidTurnstile = true;
    } else {
        // Fallback: Validate the turnstile token
        isValidTurnstile = await validateTurnstileToken(turnstileToken, ip);
    }

    if (!isValidTurnstile) {
        log.warn('Invalid Turnstile token', { maskedIp });
        return new Response(JSON.stringify({ error: 'Security check failed. Please try again.' } as LoginResponseError), { status: 400 });
    }

    // Find user by username
    const user = await db.query.users.findFirst({
        where: eq(users.nickname, username.trim())
    });

    if (!user) {
        attemptData.count++;
        attemptData.lastAttempt = now;
        loginAttempts.set(ip, attemptData);
        log.warn('Login failed - user not found', { 
            maskedIp, 
            attemptCount: attemptData.count,
            username: username.trim()
        });
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
            log.warn('Login failed - invalid password', { 
                maskedIp, 
                attemptCount: attemptData.count,
                userId: `${user.id.slice(0, 4)}...${user.id.slice(-4)}`
            });
            const remaining = Math.max(0, MAX_ATTEMPTS - attemptData.count);
            return new Response(JSON.stringify({ 
                error: `Invalid username or password. ${remaining > 0 ? remaining + " attempt(s) remaining." : "Please wait before trying again."}` 
            } as LoginResponseError), { status: 401 });
        }
    } catch (error) {
        log.error('Error verifying password', { error });
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

    log.info('Login successful', { 
        userId: `${user.id.slice(0, 4)}...${user.id.slice(-4)}`,
        expiresAt: new Date(session.expiresAt).toISOString()
    });

    return new Response(JSON.stringify({ 
        success: true,
        user: createSafeUser(user)
    } as LoginResponseSuccess), { 
        status: 200 
    });
}; 