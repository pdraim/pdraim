// Users table: holds authentication and profile details
export interface User {
    id: string;
    password: string; // hashed password
    nickname: string;
    status: UserStatus; // default is 'offline'
    avatarUrl?: string | null;
    createdAt: number;  // Timestamp (e.g., Unix timestamp)
    lastSeen?: number | null;  // Optional last active timestamp
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
    type: MessageType; // Default is 'chat'
    timestamp: number;  // Timestamp when the message was sent
    styleData?: string; // JSON string of TextStyle object for formatting
    hasFormatting?: boolean; // Flag to indicate if message has custom formatting
  }

  // Safe user type for API responses - omits sensitive information
  export type SafeUser = Omit<User, 'password' | 'createdAt'>;

  // Helper function to create a safe user object
  export function createSafeUser(user: Partial<User> & Pick<User, 'id' | 'nickname' | 'status'>): SafeUser {
    const safeUser: SafeUser = {
      id: user.id,
      nickname: user.nickname,
      status: user.status,
      avatarUrl: user.avatarUrl,
      lastSeen: user.lastSeen ?? 0
    };
    return safeUser;
  }

  // Update EnrichedMessage to use SafeUser
  export interface EnrichedMessage extends Message {
    user: SafeUser;
  }

  export type MessageType = 'chat' | 'emote' | 'system' | string;

  export interface Session {
    id: string;
    userId: string;
    expiresAt: number;
    createdAt: number;
  }
  
