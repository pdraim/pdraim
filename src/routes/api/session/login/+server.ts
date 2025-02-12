import type { RequestHandler } from '@sveltejs/kit';
import type { LoginResponseSuccess, LoginResponseError } from '$lib/types/payloads';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword } from '$lib/utils/password';
import { generateSessionToken, createSession } from '$lib/api/session.server';
import { setSessionTokenCookie } from '$lib/api/session.cookie';

export const POST: RequestHandler = async ({ request, cookies }) => {
    console.debug("POST /api/session/login called");

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' } as LoginResponseError), { status: 405 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch (err) {
        console.debug("Invalid JSON", err);
        return new Response(JSON.stringify({ error: 'Invalid JSON' } as LoginResponseError), { status: 400 });
    }

    const { username, password } = body as { username: string, password: string };

    if (typeof username !== 'string' || typeof password !== 'string') {
        console.debug("Missing or invalid input fields", { username, password });
        return new Response(JSON.stringify({ error: 'Missing or invalid input fields' } as LoginResponseError), { status: 400 });
    }

    // Find user by username
    const user = await db.query.users.findFirst({
        where: eq(users.nickname, username.trim())
    });

    if (!user) {
        console.debug("User not found:", username);
        return new Response(JSON.stringify({ error: 'Invalid username or password' } as LoginResponseError), { status: 401 });
    }

    // Verify password
    try {
        const isValid = await verifyPassword(password.trim(), user.password);
        if (!isValid) {
            console.debug("Invalid password for user:", username);
            return new Response(JSON.stringify({ error: 'Invalid username or password' } as LoginResponseError), { status: 401 });
        }
    } catch (err) {
        console.debug("Error verifying password", err);
        return new Response(JSON.stringify({ error: 'Internal Server Error' } as LoginResponseError), { status: 500 });
    }

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