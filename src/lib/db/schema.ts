import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";
import type { User, ChatRoom, Message, UserStatus, MessageType, Session } from "../types/chat";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";


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
    styleData: t.text("style_data"), // JSON string of TextStyle object
    hasFormatting: t.integer("has_formatting", { mode: "boolean" }).default(false), // Boolean flag
  }
);

export const userTextPreferences = table(
  "user_text_preferences",
  {
    userId: t.text("user_id").references(() => users.id).primaryKey(),
    defaultFontFamily: t.text("default_font_family").default("tahoma"),
    defaultFontSize: t.integer("default_font_size").default(14),
    defaultColor: t.text("default_color").default("black"),
    allowFormatting: t.integer("allow_formatting", { mode: "boolean" }).default(true),
    maxMessageLength: t.integer("max_message_length").default(500),
    stylePresets: t.text("style_presets"), // JSON array of saved styles
    createdAt: t.integer("created_at").notNull(),
    updatedAt: t.integer("updated_at").notNull(),
  }
);

// Validate schema types against interfaces
export type Users = typeof users.$inferSelect;
export type ChatRooms = typeof chatRooms.$inferSelect;
export type Messages = typeof messages.$inferSelect;
export type Sessions = typeof sessions.$inferSelect;
export type UserTextPreferences = typeof userTextPreferences.$inferSelect;
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
    userTextPreferences,
    userView,
    chatRoomView,
    messageView
};


export default schema;

