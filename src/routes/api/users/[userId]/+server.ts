import { error, json } from '@sveltejs/kit';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
    const maskedUserId = `${params.userId.slice(0, 4)}...${params.userId.slice(-4)}`;
    console.log('[Users] Fetching user data:', { userId: maskedUserId });

    try {
        const user = await db.select({
            id: users.id,
            nickname: users.nickname,
            status: users.status,
            avatarUrl: users.avatarUrl,
            lastSeen: users.lastSeen
        })
        .from(users)
        .where(eq(users.id, params.userId))
        .get();

        if (!user) {
            console.log('[Users] User not found:', { userId: maskedUserId });
            throw error(404, 'User not found');
        }

        console.log('[Users] User data retrieved:', { 
            userId: maskedUserId,
            status: user.status,
            lastSeen: user.lastSeen ? new Date(user.lastSeen).toISOString() : null
        });
        return json({
            success: true,
            user
        });
    } catch {
        console.log('[Users] Error fetching user data:', { userId: maskedUserId });
        throw error(500, 'Failed to fetch user information');
    }
};