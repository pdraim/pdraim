import { error } from '@sveltejs/kit';
import { sseEmitter } from '$lib/sseEmitter';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST({ request, locals }) {
    if (!locals.user) {
        throw error(401, 'Authentication required');
    }

    const { status } = await request.json();
    const validStatuses = ['online', 'away', 'busy', 'offline'];
    if (!validStatuses.includes(status)) {
        throw error(400, 'Invalid status');
    }

    const userId = locals.user.id;
    console.debug('Updating status for user', userId, 'to', status);

    // Update the user status in the database
    await db.update(users).set({ status, lastSeen: status === 'offline' ? Date.now() : null }).where(eq(users.id, userId));
    console.debug('Status updated in database');

    // Broadcast the status update via SSE
    sseEmitter.emit('sse', { type: 'userStatusUpdate', data: { userId, status, lastSeen: status === 'offline' ? Date.now() : null } });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
} 