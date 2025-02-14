import type { Message } from '$lib/types/chat';
import { DEFAULT_CHAT_ROOM_ID } from '$lib/db/schema';

interface RoomCache {
    messages: Message[];
    lastUpdated: number;
}

class MessageCache {
    private static instance: MessageCache;
    private rooms: Map<string, RoomCache>;
    private readonly maxMessagesPerRoom: number;
    private readonly maxRooms: number;
    private readonly cacheExpiryMs: number;
    
    private constructor() {
        this.rooms = new Map();
        this.maxMessagesPerRoom = 100; // Keep last 100 messages per room
        this.maxRooms = 100; // Maximum number of rooms to cache
        this.cacheExpiryMs = 30 * 60 * 1000; // 30 minutes cache expiry
        console.debug('[MessageCache] Initialized with settings:', {
            maxMessagesPerRoom: this.maxMessagesPerRoom,
            maxRooms: this.maxRooms,
            cacheExpiryMs: this.cacheExpiryMs
        });
    }

    public static getInstance(): MessageCache {
        if (!MessageCache.instance) {
            MessageCache.instance = new MessageCache();
        }
        return MessageCache.instance;
    }

    private cleanExpiredRooms(): void {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [roomId, cache] of this.rooms.entries()) {
            if (now - cache.lastUpdated > this.cacheExpiryMs) {
                this.rooms.delete(roomId);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            console.debug('[MessageCache] Cleaned expired rooms:', { expiredCount });
        }
    }

    private ensureRoomCapacity(): void {
        // If we're over capacity, remove the least recently used rooms
        if (this.rooms.size > this.maxRooms) {
            const sortedRooms = Array.from(this.rooms.entries())
                .sort(([, a], [, b]) => a.lastUpdated - b.lastUpdated);
            
            const toRemove = sortedRooms.slice(0, sortedRooms.length - this.maxRooms);
            for (const [roomId] of toRemove) {
                this.rooms.delete(roomId);
            }
            
            console.debug('[MessageCache] Removed LRU rooms:', { 
                removedCount: toRemove.length,
                remainingRooms: this.rooms.size 
            });
        }
    }

    public async initialize(messages: Message[]): Promise<void> {
        console.debug('[MessageCache] Initializing with messages:', messages.length);
        // Group messages by chat room
        const messagesByRoom = new Map<string, Message[]>();
        
        for (const message of messages) {
            const roomMessages = messagesByRoom.get(message.chatRoomId) || [];
            roomMessages.push(message);
            messagesByRoom.set(message.chatRoomId, roomMessages);
        }

        const now = Date.now();

        // Sort messages by timestamp and limit to maxMessagesPerRoom
        for (const [roomId, roomMessages] of messagesByRoom) {
            roomMessages.sort((a, b) => a.timestamp - b.timestamp);
            this.rooms.set(roomId, {
                messages: roomMessages.slice(-this.maxMessagesPerRoom),
                lastUpdated: now
            });
        }

        this.ensureRoomCapacity();
        console.debug('[MessageCache] Initialization complete:', { 
            roomCount: this.rooms.size,
            totalMessages: messages.length
        });
    }

    public getMessages(roomId: string = DEFAULT_CHAT_ROOM_ID, limit?: number): Message[] {
        const roomCache = this.rooms.get(roomId);
        if (!roomCache) {
            return [];
        }

        // Update last accessed time
        roomCache.lastUpdated = Date.now();
        
        if (limit) {
            return roomCache.messages.slice(-limit);
        }
        return [...roomCache.messages]; // Return a copy to prevent external modifications
    }

    public addMessage(message: Message): void {
        // Clean expired rooms periodically
        this.cleanExpiredRooms();

        const roomCache = this.rooms.get(message.chatRoomId) || {
            messages: [],
            lastUpdated: Date.now()
        };

        roomCache.messages.push(message);
        roomCache.lastUpdated = Date.now();
        
        // Keep only the last maxMessagesPerRoom messages
        if (roomCache.messages.length > this.maxMessagesPerRoom) {
            roomCache.messages.shift(); // Remove oldest message
        }
        
        this.rooms.set(message.chatRoomId, roomCache);
        this.ensureRoomCapacity();

        console.debug('[MessageCache] Added message to cache:', { 
            messageId: message.id,
            roomId: message.chatRoomId,
            roomMessageCount: roomCache.messages.length,
            totalRooms: this.rooms.size
        });
    }

    public getRoomMessageCount(roomId: string): number {
        return this.rooms.get(roomId)?.messages.length || 0;
    }

    public clear(): void {
        this.rooms.clear();
        console.debug('[MessageCache] Cache cleared');
    }

    public getCacheStats(): {
        roomCount: number;
        totalMessages: number;
        roomStats: { roomId: string; messageCount: number; lastUpdated: number }[];
    } {
        let totalMessages = 0;
        const roomStats = [];

        for (const [roomId, cache] of this.rooms.entries()) {
            totalMessages += cache.messages.length;
            roomStats.push({
                roomId,
                messageCount: cache.messages.length,
                lastUpdated: cache.lastUpdated
            });
        }

        return {
            roomCount: this.rooms.size,
            totalMessages,
            roomStats: roomStats.sort((a, b) => b.lastUpdated - a.lastUpdated)
        };
    }
}

export const messageCache = MessageCache.getInstance(); 