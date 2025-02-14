import { messageCache } from '$lib/cache/message-cache';
import db from '$lib/db/db.server';
import { messages } from '$lib/db/schema';
import { desc } from 'drizzle-orm';

let isCacheInitialized = false;

export async function initializeMessageCache(): Promise<void> {
    if (isCacheInitialized) {
        console.debug('[Cache] Message cache already initialized.');
        return;
    }
    try {
        console.debug('[Cache] Initializing message cache with pre-population.');
        const fetchedMessages = await db.select()
            .from(messages)
            .orderBy(desc(messages.timestamp))
            .limit(500);
        // Reverse to get messages in chronological order
        await messageCache.initialize(fetchedMessages.reverse());
        isCacheInitialized = true;
        const stats = messageCache.getCacheStats();
        console.debug('[Cache] Message cache initialized successfully:', {
            roomCount: stats.roomCount,
            totalMessages: stats.totalMessages
        });
    } catch (error) {
        console.error('[Cache] Failed to initialize message cache:', error);
    }
} 