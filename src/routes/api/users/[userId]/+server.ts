import { error, json } from '@sveltejs/kit';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
    console.debug('GET /api/users/[userId] called with params:', params);

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
            console.debug('User not found:', params.userId);
            throw error(404, 'User not found');
        }

        console.debug('User found:', user);
        return json({
            success: true,
            user
        });
    } catch (err) {
        console.debug('Error fetching user:', err);
        throw error(500, 'Failed to fetch user information');
    }
}; 