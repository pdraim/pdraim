import { v4 as uuidv4 } from 'uuid';
import db from '$lib/db/db.server';
import { messages } from '$lib/db/schema';
import type { Message } from '$lib/types/chat';
import type { 
    SendMessageRequest, 
    SendMessageResponse, 
    GetMessagesResponse 
} from '$lib/types/payloads';
import { desc, eq, lt, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { sseEmitter } from '$lib/sseEmitter';
import { chatRooms } from '$lib/db/schema';
import { users } from '$lib/db/schema';
import { DEFAULT_CHAT_ROOM_ID } from '$lib/utils/chat.server';
import { messageCache } from '$lib/cache/message-cache';
import { createLogger } from '$lib/utils/logger.server';
import { SQL } from 'drizzle-orm';

const log = createLogger('chat-server');

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
        log.info('Initializing message cache');
        // Fetch messages from all rooms, limited to last 100 per room
        const fetchedMessages = await db.select()
            .from(messages)
            .orderBy(desc(messages.timestamp))
            .limit(500); // Increased limit to accommodate multiple rooms
            
        await messageCache.initialize(fetchedMessages.reverse());
        isCacheInitialized = true;
        
        // Log cache stats after initialization
        const stats = messageCache.getCacheStats();
        log.info('Message cache initialized successfully', {
            roomCount: stats.roomCount,
            totalMessages: stats.totalMessages
        });
    } catch (error) {
        log.error('Failed to initialize message cache', { error });
        // Don't set isCacheInitialized to true on error
    }
}

// GET endpoint: fetch messages from cache or DB
export async function GET({ request, locals }) {
    const url = new URL(request.url);
    const beforeTimestamp = url.searchParams.get('before');
    const roomId = url.searchParams.get('roomId') || DEFAULT_CHAT_ROOM_ID;
    let fetchedMessages: Message[] = [];

    try {
        // Initialize cache if needed
        if (!isCacheInitialized) {
            await initializeCache();
        }

        // Try to get messages from cache first
        if (!beforeTimestamp) {
            log.debug('Attempting to fetch messages from cache', { 
                roomId,
                isAuthenticated: !!locals.session
            });

            // Use appropriate method based on authentication status
            const cachedMessages = locals.session 
                ? messageCache.getMessages(roomId)
                : messageCache.getPublicMessages(roomId);

            if (cachedMessages && cachedMessages.length > 0) {
                log.debug('Messages found in cache', { 
                    count: cachedMessages.length,
                    roomId,
                    isAuthenticated: !!locals.session
                });
                fetchedMessages = cachedMessages;
            }
        }

        // If no cached messages or pagination requested, fetch from DB
        if (fetchedMessages.length === 0 || beforeTimestamp) {
            log.debug('Fetching messages from database', { 
                beforeTimestamp,
                roomId,
                isAuthenticated: !!locals.session
            });

            let conditions = eq(messages.chatRoomId, roomId) as SQL<unknown>;
            
            if (beforeTimestamp) {
                conditions = and(
                    conditions,
                    lt(messages.timestamp, parseInt(beforeTimestamp))
                ) as SQL<unknown>;
            }

            // Build and execute query with conditions
            const fetchLimit = locals.session ? 100 : 10;
            fetchedMessages = await db.select()
                .from(messages)
                .where(conditions)
                .orderBy(desc(messages.timestamp))
                .limit(fetchLimit);

            // Update cache with new messages if not paginating
            if (!beforeTimestamp && fetchedMessages.length > 0) {
                for (const msg of fetchedMessages) {
                    messageCache.addMessage(msg);
                }
            }
        }

        const response: GetMessagesResponse = {
            success: true,
            messages: fetchedMessages
        };

        return new Response(JSON.stringify(response), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (err) {
        log.error('Error fetching messages:', { error: err });
        throw error(500, 'Failed to fetch messages');
    }
}

// POST endpoint: receive a new message, save it in the DB, and broadcast via SSE
export async function POST({ request, locals }: { request: Request, locals: App.Locals }) {
    if (!locals.user) {
        log.warn('Authentication required');
        throw error(401, 'Authentication required');
    }

    log.debug('New message received');
    try {
        // Check rate limiting
        const { canSend, retryAfter } = updateUserCooldown(locals.user.id);
        if (!canSend) {
            const maskedUserId = `${locals.user.id.slice(0, 4)}...${locals.user.id.slice(-4)}`;
            log.warn('Rate limited', { 
                userId: maskedUserId, 
                retryAfter 
            });
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

        const data = await request.json() as SendMessageRequest;
        if (!data.content || !data.userId) {
            log.warn('Invalid payload received', { 
                hasContent: Boolean(data.content),
                hasUserId: Boolean(data.userId)
            });
            const errorResponse: SendMessageResponse = {
                success: false,
                error: 'Invalid message payload'
            };
            return new Response(JSON.stringify(errorResponse), { status: 400 });
        }

        if (data.userId !== locals.user.id) {
            log.warn('Unauthorized message attempt', {
                requestedUserId: data.userId,
                actualUserId: `${locals.user.id.slice(0, 4)}...${locals.user.id.slice(-4)}`
            });
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
            log.warn('Chat room not found', { chatRoomId });
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
            log.warn('User not found', { maskedUserId });
            const errorResponse: SendMessageResponse = {
                success: false,
                error: 'User not found'
            };
            return new Response(JSON.stringify(errorResponse), { status: 404 });
        }

        const newMessage: Message = {
            id: uuidv4(),
            chatRoomId,
            senderId: data.userId,
            content: data.content,
            type: data.type || 'chat',
            timestamp: Date.now()
        };

        // Save to DB
        await db.insert(messages).values(newMessage);
        log.debug('Message saved in DB', { 
            messageId: newMessage.id,
            chatRoomId: newMessage.chatRoomId,
            type: newMessage.type,
            timestamp: newMessage.timestamp
        });

        // Update message cache
        messageCache.addMessage(newMessage);
        log.debug('Message added to cache', {
            messageId: newMessage.id,
            chatRoomId: newMessage.chatRoomId
        });

        // Broadcast the new message via the unified SSE emitter
        sseEmitter.emit('sse', { type: 'chatMessage', data: newMessage });

        log.debug('Message processed successfully', {
            messageId: newMessage.id,
            userId: `${newMessage.senderId.slice(0, 4)}...${newMessage.senderId.slice(-4)}`,
            roomId: newMessage.chatRoomId
        });

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
    } catch (error) {
        log.error('Error processing message', { 
            error: error instanceof Error ? error.message : 'Unknown error'
        });
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