import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";
import type { User, ChatRoom, Message, UserStatus, MessageType, Session } from "../types/chat";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createLogger } from "$lib/utils/logger.server";

const log = createLogger('schema');

// Default chat room ID - using a UUID to avoid collisions
export const DEFAULT_CHAT_ROOM_ID = '00000000-0000-0000-0000-000000000001';

// Type guard for LibSQL errors
interface LibSQLError {
    code: string;
    message: string;
}

function isLibSQLError(error: unknown): error is LibSQLError {
    return typeof error === 'object' && error !== null && 'code' in error;
}

export const users = table(
  "users",
  {
    id: t.text("id").primaryKey().$default(() => uuidv4()),
    password: t.text("password").notNull(),
    nickname: t.text("nickname").notNull(),
    status: t.text("status").notNull().$type<UserStatus>().default("offline"),
    avatarUrl: t.text("avatar_url"),
    createdAt: t.integer("created_at").notNull(),
    lastSeen: t.integer("last_seen"),
  }
);

export const sessions = table(
  "sessions",
  {
    id: t.text("id").primaryKey(),
    userId: t.text("user_id").references(() => users.id).notNull(),
    expiresAt: t.integer("expires_at").notNull(),
    createdAt: t.integer("created_at").notNull(),
  }
);

export const chatRooms = table(
  "chat_rooms",
  {
    id: t.text("id").primaryKey().$default(() => uuidv4()),
    name: t.text("name"),
    type: t.text("type").$type<"direct" | "group">().notNull().default("direct"),
    createdAt: t.integer("created_at").notNull(),
  }
);

export const messages = table(
  "messages",
  {
    id: t.text("id").primaryKey().$default(() => uuidv4()),
    chatRoomId: t.text("chat_room_id").references(() => chatRooms.id).notNull(),
    senderId: t.text("sender_id").references(() => users.id).notNull(),
    content: t.text("content").notNull(),
    type: t.text("type").$type<MessageType>().notNull().default("chat"),
    timestamp: t.integer("timestamp").notNull(),
  }
);

// Validate schema types against interfaces
export type Users = typeof users.$inferSelect;
export type ChatRooms = typeof chatRooms.$inferSelect;
export type Messages = typeof messages.$inferSelect;
export type Sessions = typeof sessions.$inferSelect;
// These type assertions will fail if the schema doesn't match the interfaces
export type _UsersValidation = Omit<User, keyof Users> & Omit<Users, keyof User>;
export type _ChatRoomsValidation = Omit<ChatRoom, keyof ChatRooms> & Omit<ChatRooms, keyof ChatRoom>;
export type _MessagesValidation = Omit<Message, keyof Messages> & Omit<Messages, keyof Message>;
export type _SessionsValidation = Omit<Session, keyof Sessions> & Omit<Sessions, keyof Session>;

export const userView = t.sqliteView("user_view").as((qb) => 
  qb.select({
    id: users.id,
    nickname: users.nickname,
    status: users.status,
    avatarUrl: users.avatarUrl,
    lastSeen: users.lastSeen
  }).from(users)
);

export const chatRoomView = t.sqliteView("chat_room_view").as((qb) => 
  qb.select({
    id: chatRooms.id,
    name: chatRooms.name,
    type: chatRooms.type,
    createdAt: chatRooms.createdAt
  }).from(chatRooms)
);

export const messageView = t.sqliteView("message_view").as((qb) => 
  qb.select({
    id: messages.id,
    content: messages.content,
    type: messages.type,
    timestamp: messages.timestamp,
    sender: users.nickname,
    chatRoom: chatRooms.name
  })
  .from(messages)
  .leftJoin(users, eq(messages.senderId, users.id))
  .leftJoin(chatRooms, eq(messages.chatRoomId, chatRooms.id))
);

// Create a schema object with all our tables and views
const schema = {
    users,
    sessions,
    chatRooms,
    messages,
    userView,
    chatRoomView,
    messageView
};

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

export default schema;

