import { desc, eq } from 'drizzle-orm';
import db from '$lib/db/db.server';
import { messages, users } from '$lib/db/schema';
import type { PublicRoomResponse } from '$lib/types/payloads';
import { createSafeUser } from '$lib/types/chat';
import { createLogger } from '$lib/utils/logger.server';

const log = createLogger('rooms-server');

const ONLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

export async function GET({ params, url, locals }): Promise<Response> {
  const { roomId } = params;
  const isPublic = !locals.user || url.searchParams.get('public') === 'true';
  
  try {
    log.debug('Fetching room data', { 
      roomId,
      isPublic,
      requestedBy: locals.user ? `${locals.user.id.slice(0, 4)}...${locals.user.id.slice(-4)}` : 'public'
    });
    
    // Calculate timeout threshold
    const timeoutThreshold = Date.now() - ONLINE_TIMEOUT_MS;

    // Fetch buddy list: get all users and mark them as offline if they've timed out
    const fetchedUsers = await db.select()
      .from(users)
      .execute();

    // Process users to mark them as offline if they've timed out
    const processedUsers = fetchedUsers.map(user => {
      const shouldBeOffline = user.status === 'online' && user.lastSeen < timeoutThreshold;
      return {
        ...user,
        status: shouldBeOffline ? 'offline' : user.status
      };
    });

    // Update any users that should be offline in the database
    const usersToUpdate = processedUsers.filter(user => 
      user.status === 'offline' && 
      fetchedUsers.find(u => u.id === user.id)?.status === 'online'
    );

    if (usersToUpdate.length > 0) {
      await Promise.all(usersToUpdate.map(user =>
        db.update(users)
          .set({ status: 'offline', lastSeen: Date.now() })
          .where(eq(users.id, user.id))
          .execute()
      ));
      
      log.debug('Updated offline status for users', { 
        count: usersToUpdate.length,
        userIds: usersToUpdate.map(u => u.id)
      });
    }
    
    // Sanitize user data using createSafeUser
    const sanitizedUsers = processedUsers.map(user => createSafeUser(user));

    const responseData: PublicRoomResponse = {
      success: true,
      buddyList: sanitizedUsers
    };

    log.debug('Successfully fetched room data', { 
      roomId,
      userCount: sanitizedUsers.length,
      isPublic,
      offlineUpdates: usersToUpdate.length
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