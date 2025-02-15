import { error, json } from '@sveltejs/kit';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { createSafeUser } from '$lib/types/chat';

export const GET: RequestHandler = async ({ params }) => {
    const maskedUserId = `${params.userId.slice(0, 4)}...${params.userId.slice(-4)}`;
    console.log('[Users] Fetching user data:', { userId: maskedUserId });

    try {
        const user = await db.select()
        .from(users)
        .where(eq(users.id, params.userId))
        .get();

        if (!user) {
            console.log('[Users] User not found:', { userId: maskedUserId });
            throw error(404, 'User not found');
        }

        const safeUser = createSafeUser(user);

        console.log('[Users] User data retrieved:', { 
            userId: maskedUserId,
            status: safeUser.status,
            lastSeen: safeUser.lastSeen ? new Date(safeUser.lastSeen).toISOString() : null
        });
        return json({
            success: true,
            user: safeUser
        });
    } catch {
        console.log('[Users] Error fetching user data:', { userId: maskedUserId });
        throw error(500, 'Failed to fetch user information');
    }
};