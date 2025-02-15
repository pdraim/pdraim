import { messageCache } from '$lib/cache/message-cache';
import db from '$lib/db/db.server';
import { messages } from '$lib/db/schema';
import { desc } from 'drizzle-orm';
import { createLogger } from '$lib/utils/logger.server';

const log = createLogger('cache-initialize');

let isCacheInitialized = false;

export async function initializeMessageCache(): Promise<void> {
    if (isCacheInitialized) {
        log.debug('[Cache] Message cache already initialized.');
        return;
    }
    try {
        log.debug('[Cache] Initializing message cache with pre-population.');
        const fetchedMessages = await db.select()
            .from(messages)
            .orderBy(desc(messages.timestamp))
            .limit(500);
        // Reverse to get messages in chronological order
        await messageCache.initialize(fetchedMessages.reverse());
        isCacheInitialized = true;
        const stats = messageCache.getCacheStats();
        log.debug('[Cache] Message cache initialized successfully:', {
            roomCount: stats.roomCount,
            totalMessages: stats.totalMessages
        });
    } catch (error) {
        log.error('[Cache] Failed to initialize message cache:', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
} 