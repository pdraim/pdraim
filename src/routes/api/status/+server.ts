import { error } from '@sveltejs/kit';
import { sseEmitter } from '$lib/sseEmitter';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import { validateSessionToken, generateSessionToken, createSession } from '$lib/api/session.server';
import { setSessionTokenCookie } from '$lib/api/session.cookie';

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

    // Update the user status in the database
    await db.update(users)
        .set({ status, lastSeen: status === 'offline' ? Date.now() : null })
        .where(eq(users.id, userId));
    console.log('[Status] Database updated successfully');

    // Renew session if status is online and session is near expiry
    if (status === 'online') {
        const token = cookies.get('session');
        if (token) {
            const result = await validateSessionToken(token);
            if (result.session) {
                const now = Date.now();
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

    // Broadcast the status update via SSE
    sseEmitter.emit('sse', { type: 'userStatusUpdate', data: { userId, status, lastSeen: status === 'offline' ? Date.now() : null } });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}