import { v4 as uuidv4 } from 'uuid';
import db from '$lib/db/db.server';
import { messages } from '$lib/db/schema';
import type { Message } from '$lib/types/chat';
import type { 
    SendMessageRequest, 
    SendMessageResponse, 
    GetMessagesResponse 
} from '$lib/types/payloads';
import { desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { sseEmitter } from '$lib/sseEmitter';
import { eq } from 'drizzle-orm';
import { chatRooms, DEFAULT_CHAT_ROOM_ID } from '$lib/db/schema';
import { users } from '$lib/db/schema';
import { ensureDefaultChatRoom } from '$lib/db/schema';
import { messageCache } from '$lib/cache/message-cache';

// Rate limiting configuration
const INITIAL_COOLDOWN = 1000; // 1 second
const MAX_COOLDOWN = 30000; // 30 seconds
const userMessageTimestamps = new Map<string, { lastMessageTime: number; currentCooldown: number }>();

function updateUserCooldown(userId: string): { canSend: boolean; retryAfter?: number } {
    const now = Date.now();
    const userState = userMessageTimestamps.get(userId) || { lastMessageTime: 0, currentCooldown: INITIAL_COOLDOWN };
    
    // Check if enough time has passed since the last message
    const timeSinceLastMessage = now - userState.lastMessageTime;
    if (timeSinceLastMessage < userState.currentCooldown) {
        return { 
            canSend: false, 
            retryAfter: userState.currentCooldown - timeSinceLastMessage 
        };
    }

    // Reset cooldown if it's been long enough
    if (timeSinceLastMessage > userState.currentCooldown * 2) {
        userState.currentCooldown = INITIAL_COOLDOWN;
    } else {
        // Exponential backoff
        userState.currentCooldown = Math.min(userState.currentCooldown * 2, MAX_COOLDOWN);
    }

    userState.lastMessageTime = now;
    userMessageTimestamps.set(userId, userState);
    
    return { canSend: true };
}

// Initialize message cache on server start
let isCacheInitialized = false;
async function initializeCache() {
    if (isCacheInitialized) return;
    
    try {
        console.log('[Chat] Initializing message cache');
        // Fetch messages from all rooms, limited to last 100 per room
        const fetchedMessages = await db.select()
            .from(messages)
            .orderBy(desc(messages.timestamp))
            .limit(500); // Increased limit to accommodate multiple rooms
            
        await messageCache.initialize(fetchedMessages.reverse());
        isCacheInitialized = true;
        
        // Log cache stats after initialization
        const stats = messageCache.getCacheStats();
        console.log('[Chat] Message cache initialized successfully:', {
            roomCount: stats.roomCount,
            totalMessages: stats.totalMessages
        });
    } catch (error) {
        console.error('[Chat] Failed to initialize message cache:', error);
        // Don't set isCacheInitialized to true on error
    }
}

// GET endpoint: fetch messages from cache or DB
export async function GET({ request, locals }) {
    const isPublic = new URL(request.url).searchParams.get('public') === 'true';
    const roomId = new URL(request.url).searchParams.get('roomId') || DEFAULT_CHAT_ROOM_ID;
    
    if (!isPublic && !locals.user) {
        throw error(401, 'Authentication required');
    }

    try {
        // Ensure default chat room exists
        await ensureDefaultChatRoom(db);
        
        let fetchedMessages: Message[];
        if (isPublic) {
            if (!isCacheInitialized) {
                await initializeCache();
            }
            console.log('[Chat] Fetching public messages from cache', { roomId });
            fetchedMessages = messageCache.getMessages(roomId, 10);
        } else {
            if (!locals.user) {
                throw error(401, 'Authentication required');
            }
            console.log('[Chat] Fetching messages from DB for instant chat', { roomId });
            const query = db.select()
                .from(messages)
                .where(eq(messages.chatRoomId, roomId))
                .orderBy(desc(messages.timestamp))
                .limit(50);
            fetchedMessages = (await query).reverse();
        }

        const response: GetMessagesResponse = {
            success: true,
            messages: fetchedMessages
        };

        return new Response(
            JSON.stringify(response),
            { 
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.log('[Chat] Error fetching messages:', error);
        const errorResponse: GetMessagesResponse = {
            success: false,
            error: 'Failed to fetch messages'
        };
        return new Response(
            JSON.stringify(errorResponse),
            { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// POST endpoint: receive a new message, save it in the DB, and broadcast via SSE
export async function POST({ request, locals }: { request: Request, locals: App.Locals }) {
    if (!locals.user) {
        throw error(401, 'Authentication required');
    }

    console.log('[Chat] New message received');
    try {
        // Check rate limiting
        const { canSend, retryAfter } = updateUserCooldown(locals.user.id);
        if (!canSend) {
            const maskedUserId = `${locals.user.id.slice(0, 4)}...${locals.user.id.slice(-4)}`;
            console.log('[Chat] Rate limited:', { userId: maskedUserId, retryAfter });
            const errorResponse: SendMessageResponse = {
                success: false,
                error: 'Please wait before sending another message',
                retryAfter,
                isRateLimited: true
            };
            return new Response(JSON.stringify(errorResponse), { 
                status: 429,
                headers: { 
                    'Content-Type': 'application/json',
                    'Retry-After': Math.ceil(retryAfter! / 1000).toString()
                }
            });
        }

        // Ensure default chat room exists
        await ensureDefaultChatRoom(db);

        const data = await request.json() as SendMessageRequest;
        if (!data.content || !data.userId) {
            console.log('[Chat] Invalid payload received');
            const errorResponse: SendMessageResponse = {
                success: false,
                error: 'Invalid message payload'
            };
            return new Response(JSON.stringify(errorResponse), { status: 400 });
        }

        if (data.userId !== locals.user.id) {
            throw error(403, 'Cannot post messages as another user');
        }

        // Validate that both the chat room and user exist
        const chatRoomId = data.chatRoomId || DEFAULT_CHAT_ROOM_ID;
        
        // Check chat room existence
        const chatRoom = await db.select()
            .from(chatRooms)
            .where(eq(chatRooms.id, chatRoomId))
            .get();

        if (!chatRoom) {
            console.log('[Chat] Chat room not found:', chatRoomId);
            const errorResponse: SendMessageResponse = {
                success: false,
                error: 'Chat room not found'
            };
            return new Response(JSON.stringify(errorResponse), { status: 404 });
        }

        // Check user existence
        const user = await db.select()
            .from(users)
            .where(eq(users.id, data.userId))
            .get();

        if (!user) {
            const maskedUserId = `${data.userId.slice(0, 4)}...${data.userId.slice(-4)}`;
            console.log('[Chat] User not found:', maskedUserId);
            const errorResponse: SendMessageResponse = {
                success: false,
                error: 'User not found'
            };
            return new Response(JSON.stringify(errorResponse), { status: 404 });
        }

        const newMessage: Message = {
            id: uuidv4(),
            chatRoomId: data.chatRoomId || DEFAULT_CHAT_ROOM_ID,
            senderId: data.userId,
            content: data.content,
            type: data.type || 'chat',
            timestamp: Date.now()
        };

        // Save to DB
        await db.insert(messages).values(newMessage);
        console.log('[Chat] Message saved in DB', { 
            messageId: newMessage.id,
            chatRoomId: newMessage.chatRoomId,
            type: newMessage.type,
            timestamp: newMessage.timestamp
        });

        // Broadcast the new message via the unified SSE emitter
        sseEmitter.emit('sse', { type: 'chatMessage', data: newMessage });

        const successResponse: SendMessageResponse = {
            success: true,
            message: newMessage
        };

        return new Response(
            JSON.stringify(successResponse), 
            { 
                status: 201, 
                headers: { 'Content-Type': 'application/json' } 
            }
        );
    } catch {
        console.log('[Chat] Error processing message');
        const errorResponse: SendMessageResponse = {
            success: false,
            error: 'Failed to save message'
        };
        return new Response(
            JSON.stringify(errorResponse), 
            { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            }
        );
    }
} 