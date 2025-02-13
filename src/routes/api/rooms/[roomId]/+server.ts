import { desc, eq } from 'drizzle-orm';
import db from '$lib/db/db.server';
import { messages, users } from '$lib/db/schema';
import type { PublicRoomResponse } from '$lib/types/payloads';
import { error } from '@sveltejs/kit';

export async function GET({ params, url, locals }): Promise<Response> {
  const { roomId } = params;
  const isPublic = url.searchParams.get('public') === 'true';
  
  // Check authentication for non-public requests
  if (!isPublic && !locals.user) {
    throw error(401, 'Authentication required');
  }

  try {
    console.debug(`Fetching ${isPublic ? 'public' : 'private'} room data for room: ${roomId}`);
    
    // Fetch messages for the room (most recent then reversed for chronological order)
    const messageQuery = db.select()
      .from(messages)
      .where(eq(messages.chatRoomId, roomId))
      .orderBy(desc(messages.timestamp));

    // Limit messages for public requests
    if (isPublic) {
      messageQuery.limit(10);
    } else {
      messageQuery.limit(50);
    }

    // Fetch buddy list: get all users in the room (including offline)
    const fetchedUsers = await db.select()
      .from(users);
    
    // Sanitize user data by removing sensitive fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitizedUsers = fetchedUsers.map(({ password, ...userWithoutPassword }) => userWithoutPassword);

    const responseData: PublicRoomResponse = {
      success: true,
      buddyList: sanitizedUsers
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.debug('Error fetching room data:', err);
    const errorResponse: PublicRoomResponse = {
      success: false,
      error: 'Failed to fetch room data'
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 