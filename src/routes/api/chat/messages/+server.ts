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

// GET endpoint: fetch messages from the DB
export async function GET({ request, locals }) {
    const isPublic = new URL(request.url).searchParams.get('public') === 'true';
    if (!isPublic && !locals.user) {
        throw error(401, 'Authentication required');
    }

    try {
        // Ensure default chat room exists
        await ensureDefaultChatRoom(db);
        
        console.debug('Fetching messages', { isPublic });
        const query = db.select()
            .from(messages)
            .orderBy(desc(messages.timestamp));

        if (isPublic) {
            query.limit(10);
        } else {
            query.limit(50);
        }

        const fetchedMessages = await query;

        const response: GetMessagesResponse = {
            success: true,
            messages: fetchedMessages.reverse()
        };

        return new Response(
            JSON.stringify(response),
            { 
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.debug('Error fetching messages:', error);
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

    console.debug('Received new message POST');
    try {
        // Ensure default chat room exists
        await ensureDefaultChatRoom(db);

        const data = await request.json() as SendMessageRequest;
        if (!data.content || !data.userId) {
            console.debug('Invalid payload', data);
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
            console.debug('Chat room not found:', chatRoomId);
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
            console.debug('User not found:', data.userId);
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

        await db.insert(messages).values(newMessage);
        console.debug('Message saved in DB', newMessage);

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
    } catch (error) {
        console.debug('Error processing POST:', error);
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