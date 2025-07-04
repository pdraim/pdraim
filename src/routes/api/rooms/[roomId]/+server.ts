import { eq } from 'drizzle-orm/sql';
import db from '$lib/db/db.server';
import { users } from '$lib/db/schema';
import type { SafeUser } from '$lib/types/chat';
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

    // Fetch buddy list: get all users
    const fetchedUsers = await db.select()
      .from(users)
      .execute();

    // Normalize users to ensure that lastSeen is always a number (using 0 if null)
    const normalizedUsers = fetchedUsers.map(
      (user: SafeUser & { lastSeen: number | null }) => ({
        ...user,
        lastSeen: user.lastSeen ?? 0
      })
    );

    // Process users to mark them as offline if they've timed out
    const processedUsers = normalizedUsers.map(
      (user: SafeUser & { lastSeen: number }) => {
        const shouldBeOffline = user.status !== 'offline' && user.lastSeen < timeoutThreshold;
        return {
          ...user,
          status: shouldBeOffline ? 'offline' : user.status
        };
      }
    );

    // Find users who were originally non-offline but now marked offline
    const usersToUpdate = processedUsers.filter(
      (user: SafeUser & { lastSeen: number }) =>
        user.status === 'offline' &&
        normalizedUsers.find(
          (u: SafeUser & { lastSeen: number }) => u.id === user.id
        )?.status !== 'offline'
    );

    if (usersToUpdate.length > 0) {
      await Promise.all(
        usersToUpdate.map((user: SafeUser & { lastSeen: number }) =>
          db.update(users)
            .set({ status: 'offline', lastSeen: Date.now() })
            .where(eq(users.id, user.id))
            .execute()
        )
      );
      
      log.debug('Updated offline status for users', { 
        count: usersToUpdate.length,
        userIds: usersToUpdate.map((u: SafeUser & { lastSeen: number }) => u.id)
      });
    }

    // Sanitize user data using createSafeUser
    const sanitizedUsers = processedUsers.map(
      (user: SafeUser & { lastSeen: number }) => createSafeUser(user)
    );

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