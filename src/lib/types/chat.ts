/**
 * TypeScript interfaces for an AOL Instant Messenger–like project.
 * Each interface represents a table structure in your database.
 */

// Users table: holds authentication and profile details
export interface User {
    id: string;
    email: string;
    password: string; // hashed password
    nickname: string;
    status: UserStatus; // default is 'offline'
    avatarUrl?: string;
    createdAt: number;  // Timestamp (e.g., Unix timestamp)
    lastSeen?: number;  // Optional last active timestamp
  }

export type UserStatus = 'offline' | 'online' | 'away' | string;
  
  // Chat rooms table: supports both direct (private) and group chat conversations
  export interface ChatRoom {
    id: string;
    name?: string;               // Optional for direct chats, required for groups
    type: 'direct' | 'group' | string; // Default is 'direct'
    createdAt: number;           // Creation timestamp
  }
  
  // Messages table: stores the conversation messages
  export interface Message {
    id: string;
    chatRoomId: string; // Reference to the chat room (ChatRoom.id)
    senderId: string;   // Reference to the sender (User.id)
    content: string;
    type: 'chat' | 'emote' | 'system' | string; // Default is 'chat'
    timestamp: number;  // Timestamp when the message was sent
  }