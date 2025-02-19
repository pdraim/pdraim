import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm/sql';
import { validateSessionToken, generateSessionToken, createSession } from '$lib/api/session.server';
import { setSessionTokenCookie } from '$lib/api/session.cookie';
import { createSafeUser } from '$lib/types/chat';
import { createLogger } from '$lib/utils/logger.server';
import type { RequestHandler } from './$types';

const log = createLogger('status-server');

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
    if (!locals.user) {
        log.warn('Authentication required');
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { status } = await request.json();
        const validStatuses = ['online', 'away', 'busy', 'offline'];
        if (!validStatuses.includes(status)) {
            log.warn('Invalid status received', { status });
            return new Response(JSON.stringify({ success: false, error: 'Invalid status' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const userId = locals.user.id;
        const maskedUserId = `${userId.slice(0, 4)}...${userId.slice(-4)}`;
        log.debug('Updating user status', { userId: maskedUserId, status });

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
        log.debug('Database updated successfully', { userId: maskedUserId, status });

        // Renew session if status is online
        if (status === 'online') {
            const token = cookies.get('session');
            if (token) {
                const result = await validateSessionToken(token);
                if (result.session) {
                    const newToken = generateSessionToken();
                    const newSession = await createSession(newToken, userId);
                    setSessionTokenCookie({ cookies }, newToken, newSession.expiresAt);
                    log.info('Session renewed', { 
                        userId: maskedUserId, 
                        expiresAt: new Date(newSession.expiresAt).toISOString() 
                    });
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
    } catch (error) {
        return new Response(
            JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
};