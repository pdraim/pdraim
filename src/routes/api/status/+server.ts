import { error } from '@sveltejs/kit';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { validateSessionToken, generateSessionToken, createSession } from '$lib/api/session.server';
import { setSessionTokenCookie } from '$lib/api/session.cookie';
import { createSafeUser } from '$lib/types/chat';

export async function POST({ request, cookies, locals }) {
    if (!locals.user) {
        throw error(401, 'Authentication required');
    }

    const { status } = await request.json();
    const validStatuses = ['online', 'away', 'busy', 'offline'];
    if (!validStatuses.includes(status)) {
        throw error(400, 'Invalid status');
    }

    const userId = locals.user.id;
    const maskedUserId = `${userId.slice(0, 4)}...${userId.slice(-4)}`;
    console.log('[Status] Updating user status:', { userId: maskedUserId, status });

    const now = Date.now();

    // Update the user status in the database
    // Always update lastSeen to support timeout detection
    const updatedUser = await db.update(users)
        .set({ 
            status, 
            lastSeen: now // Always update lastSeen for proper timeout detection
        })
        .where(eq(users.id, userId))
        .returning()
        .get();
    console.log('[Status] Database updated successfully');

    // Renew session if status is online and session is near expiry
    if (status === 'online') {
        const token = cookies.get('session');
        if (token) {
            const result = await validateSessionToken(token);
            if (result.session) {
                const remaining = result.session.expiresAt - now;
                const threshold = 15 * 60 * 1000; // 15 minutes in milliseconds
                if (remaining < threshold) {
                    const newToken = generateSessionToken();
                    const newSession = await createSession(newToken, userId);
                    setSessionTokenCookie({ cookies }, newToken, newSession.expiresAt);
                    console.log('[Status] Session renewed:', { userId: maskedUserId, expiresAt: new Date(newSession.expiresAt).toISOString() });
                }
            }
        }
    }

    return new Response(JSON.stringify({ 
        success: true,
        user: createSafeUser(updatedUser)
    }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
    });
}