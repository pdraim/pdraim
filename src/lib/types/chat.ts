export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

export interface User {
    id: string;
    nickname: string;
    status: UserStatus;
    statusMessage?: string;
    avatarUrl?: string;
}

export type MessageType = 'chat' | 'emote' | 'system';

export interface ChatMessage {
    id: string;
    userId: string;
    content: string;
    timestamp: Date;
    type: MessageType;
} 