import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createLogger } from "$lib/utils/logger.server";
import schema, { chatRooms } from "$lib/db/schema";
import { eq } from "drizzle-orm";
import { env } from "$env/dynamic/public";

const log = createLogger('chat-utils');

// Default chat room ID from environment variable
export const DEFAULT_CHAT_ROOM_ID = env.PUBLIC_DEFAULT_CHAT_ROOM_ID || '00000000-0000-0000-0000-000000000001';

// Type guard for LibSQL errors
interface LibSQLError {
    code: string;
    message: string;
}

function isLibSQLError(error: unknown): error is LibSQLError {
    return typeof error === 'object' && error !== null && 'code' in error;
}

// Function to ensure default chat room exists
export async function ensureDefaultChatRoom(db: LibSQLDatabase<typeof schema>) {
    log.debug('Ensuring default chat room exists...');
    try {
        // Use a transaction to handle concurrent creation attempts
        await db.transaction(async (tx) => {
            const defaultRoom = await tx.select()
                .from(chatRooms)
                .where(eq(chatRooms.id, DEFAULT_CHAT_ROOM_ID))
                .get();

            if (!defaultRoom) {
                log.debug('Creating default chat room...');
                await tx.insert(chatRooms).values({
                    id: DEFAULT_CHAT_ROOM_ID,
                    name: 'General',
                    type: 'group',
                    createdAt: Date.now()
                });
                log.debug('Default chat room created successfully');
            } else {
                log.debug('Default chat room already exists');
            }
        });
    } catch (error: unknown) {
        // If the error is a unique constraint violation, another process probably created the room
        if (isLibSQLError(error) && error.code === 'SQLITE_CONSTRAINT') {
            log.debug('Default chat room was created by another process');
            return;
        }
        log.error('Error ensuring default chat room:', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
    }
} 