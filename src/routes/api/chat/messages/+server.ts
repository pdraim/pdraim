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

// Global set to store SSE controllers
const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

// GET endpoint: handle both SSE connections and initial message fetches
export async function GET({ request, locals }) {
    const acceptHeader = request.headers.get('Accept');
    const isPublic = new URL(request.url).searchParams.get('public') === 'true';
    
    // If Accept header is event-stream, handle as SSE connection
    if (acceptHeader?.includes('text/event-stream')) {
        // SSE connections require authentication
        if (!locals.user) {
            throw error(401, 'Authentication required for real-time updates');
        }

        console.debug('Establishing new SSE connection for chat messages');
        let thisController: ReadableStreamDefaultController<Uint8Array>;
        let heartbeatInterval: NodeJS.Timeout;
        
        const stream = new ReadableStream({
            start(controller) {
                console.debug('SSE controller started');
                thisController = controller;
                sseClients.add(controller);
                const encoder = new TextEncoder();
                // Send initial connection message
                controller.enqueue(encoder.encode(`data: Connected\n\n`));
                
                // Heartbeat to keep the connection alive every 15 seconds
                heartbeatInterval = setInterval(() => {
                    controller.enqueue(encoder.encode(`: heartbeat\n\n`));
                }, 15000);
            },
            cancel() {
                console.debug('SSE connection cancelled');
                sseClients.delete(thisController);
                clearInterval(heartbeatInterval);
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });
    }
    
    // For regular GET requests, check authentication unless it's a public request
    if (!isPublic && !locals.user) {
        throw error(401, 'Authentication required');
    }

    try {
        console.debug('Fetching messages', { isPublic });
        const query = db.select()
            .from(messages)
            .orderBy(desc(messages.timestamp));

        // For public requests, limit to 10 most recent messages
        if (isPublic) {
            query.limit(10);
        } else {
            query.limit(50);
        }

        const fetchedMessages = await query;
            
        // Return messages in chronological order with success response
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
    // Require authentication for posting messages
    if (!locals.user) {
        throw error(401, 'Authentication required');
    }

    console.debug('Received new message POST');
    try {
        const data = await request.json() as SendMessageRequest;
        // Validate input payload
        if (!data.content || !data.userId) {
            console.debug('Invalid payload', data);
            const errorResponse: SendMessageResponse = {
                success: false,
                error: 'Invalid message payload'
            };
            return new Response(JSON.stringify(errorResponse), { status: 400 });
        }

        // Verify the user is posting as themselves
        if (data.userId !== locals.user.id) {
            throw error(403, 'Cannot post messages as another user');
        }

        // Create a new message object
        const newMessage: Message = {
            id: uuidv4(),
            chatRoomId: data.chatRoomId || 'default',
            senderId: data.userId,
            content: data.content,
            type: data.type || 'chat',
            timestamp: Date.now()
        };

        // Save the message in the database
        await db.insert(messages).values(newMessage);
        console.debug('Message saved in DB', newMessage);

        // Broadcast the new message to all connected SSE clients
        const encoder = new TextEncoder();
        const sseData = `data: ${JSON.stringify(newMessage)}\n\n`;
        sseClients.forEach(controller => {
            try {
                controller.enqueue(encoder.encode(sseData));
            } catch (error) {
                console.debug('Error broadcasting to a client:', error);
            }
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