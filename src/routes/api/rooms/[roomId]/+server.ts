import { desc, eq } from 'drizzle-orm';
import db from '$lib/db/db.server';
import { messages, users } from '$lib/db/schema';
import type { PublicRoomResponse } from '$lib/types/payloads';
import { error } from '@sveltejs/kit';
import { createSafeUser } from '$lib/types/chat';
import { createLogger } from '$lib/utils/logger.server';

const log = createLogger('rooms-server');

export async function GET({ params, url, locals }): Promise<Response> {
  const { roomId } = params;
  const isPublic = url.searchParams.get('public') === 'true';
  
  // Check authentication for non-public requests
  if (!isPublic && !locals.user) {
    log.warn('Authentication required');
    throw error(401, 'Authentication required');
  }

  try {
    log.debug('Fetching room data', { 
      roomId,
      isPublic,
      requestedBy: locals.user ? `${locals.user.id.slice(0, 4)}...${locals.user.id.slice(-4)}` : 'public'
    });
    
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
    
    // Sanitize user data using createSafeUser
    const sanitizedUsers = fetchedUsers.map(user => createSafeUser(user));

    const responseData: PublicRoomResponse = {
      success: true,
      buddyList: sanitizedUsers
    };

    log.debug('Successfully fetched room data', { 
      roomId,
      userCount: sanitizedUsers.length,
      isPublic
    });

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    log.error('Error fetching room data', { 
      roomId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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