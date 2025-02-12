import type { User, Message, EnrichedMessage } from '../types/chat';
import type { 
    SendMessageRequest, 
    SendMessageResponse, 
    GetMessagesResponse 
} from '../types/payloads';
import { invalidate } from '$app/navigation';


class ChatState {
    private users = $state<User[]>([]);
    private messages = $state<Message[]>([]);
    private currentUser = $state<User | null>(null);
    private eventSource: EventSource | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private isInitializing = $state(false);
    private currentRoomId = $state<string>('default');
    private userCache = $state<Record<string, User>>({});

    public async reinitialize() {
        console.debug('Reinitializing chat state...');
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.messages = [];
        if (this.currentUser) {
            await Promise.all([
                this.initializeMessages(),
                this.initializeRoomUsers()
            ]);
            this.setupSSE();
        }
    }

    // User methods
    getCurrentUser() {
        return this.currentUser;
    }

    async setCurrentUser(user: User | null) {
        console.debug('setCurrentUser called with', user);
        this.currentUser = user;

        if (user) {
            await Promise.all([
                this.initializeMessages(),
                this.initializeRoomUsers()
            ]);
            this.setupSSE();
        } else {
            // If no global session, clear SSE and state
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            this.messages = [];
            this.users = [];
        }

        // Invalidate both session and messages to trigger reloads
        await Promise.all([
            invalidate('chat:session'),
            invalidate('chat:messages')
        ]);
    }

    private async initializeRoomUsers() {
        console.debug('Initializing room users for room:', this.currentRoomId);
        try {
            const response = await fetch(`/api/rooms/${this.currentRoomId}`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch room users');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error);
            }

            console.debug('Fetched room buddy list:', data.buddyList);
            this.users = data.buddyList;
            // Update cache with new buddy list users
            this.users.forEach(user => {
                this.userCache[user.id] = user;
            });
        } catch (error) {
            console.debug('Error fetching room users:', error);
            this.users = [];
        }
    }

    getOnlineUsers() {
        return this.users.filter((user: User) => user.status !== 'offline');
    }

    getUserById(userId: string) {
        // First check the cache
        if (this.userCache[userId]) {
            return this.userCache[userId];
        }
        
        // If not in cache, look up in users array
        const user = this.users.find((user: User) => user.id === userId);
        if (user) {
            // Update cache
            this.userCache[userId] = user;
            console.debug('getUserById: cached user data', { userId, user });
        } else {
            console.debug('getUserById: user not found', { userId });
        }
        return user;
    }

    updateUserStatus(userId: string, status: User['status']) {
        this.users = this.users.map((user: User) => {
            if (user.id === userId) {
                const updatedUser = { ...user, status };
                // Update cache
                this.userCache[userId] = updatedUser;
                return updatedUser;
            }
            return user;
        });
    }

    // Message methods
    getMessages() {
        // Return messages with enriched user data
        return this.enrichMessages(this.messages);
    }

    // Add method to update user cache for public access
    updateUserCache(users: User[]) {
        users.forEach(user => {
            this.userCache[user.id] = user;
        });
        // Also update the users array
        this.users = users;
    }

    // Add method to update messages for public access
    updateMessages(messages: Message[]) {
        this.messages = messages;
    }

    async initializeMessages() {
        try {
            const response = await fetch('/api/chat/messages', {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to fetch messages');
            
            const data = await response.json() as GetMessagesResponse;
            if (!data.success) {
                throw new Error(data.error);
            }

            // Get unique user IDs from messages that aren't in the cache
            const uniqueUserIds = new Set(data.messages.map(msg => msg.senderId));
            const missingUserIds = Array.from(uniqueUserIds).filter(id => !this.userCache[id]);

            // Fetch missing user data in parallel
            if (missingUserIds.length > 0) {
                console.debug('Fetching missing user data for IDs:', missingUserIds);
                await Promise.all(missingUserIds.map(async (userId) => {
                    try {
                        const userResponse = await fetch(`/api/users/${userId}`, {
                            credentials: 'include'
                        });
                        if (userResponse.ok) {
                            const userData = await userResponse.json();
                            if (userData.success && userData.user) {
                                this.userCache[userId] = userData.user;
                                // Only add to users array if not already present
                                if (!this.users.some(u => u.id === userId)) {
                                    this.users = [...this.users, userData.user];
                                }
                            }
                        }
                    } catch (error) {
                        console.debug('Error fetching user data:', { userId, error });
                    }
                }));
            }

            this.messages = data.messages;
        } catch (error) {
            console.debug('Error fetching initial messages:', error);
            this.messages = [];
        }
    }

    async sendMessage(content: string, type: Message['type'] = 'chat') {
        const user = this.getCurrentUser();
        if (!user) {
            console.debug('Cannot send message: No current user');
            return;
        }
        
        try {
            const payload: SendMessageRequest = {
                content,
                type,
                userId: user.id,
                chatRoomId: 'default'
            };

            console.debug('Sending message with payload:', payload);

            const response = await fetch('/api/chat/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save message');
            }

            const data = await response.json() as SendMessageResponse;
            if (!data.success) {
                throw new Error(data.error);
            }

            console.debug('Message sent successfully:', data.message);
            await invalidate('chat:messages');
        } catch (error) {
            console.debug('Error sending message:', error);
            throw error;
        }
    }

    private setupSSE() {
        console.debug('Setting up SSE connection for chat messages');
        this.connectSSE();
    }

    private connectSSE() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        this.eventSource = new EventSource('/api/chat/messages', {
            withCredentials: true
        });
        
        this.eventSource.onmessage = async (event) => {
            try {
                if (event.data === 'Connected') {
                    console.debug('SSE connection established');
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    return;
                }

                const messageData = JSON.parse(event.data) as Message;
                
                // Ensure we have the sender's data before adding the message
                if (!this.userCache[messageData.senderId]) {
                    try {
                        console.debug('Fetching user data for new message:', messageData.senderId);
                        const response = await fetch(`/api/users/${messageData.senderId}`, {
                            credentials: 'include'
                        });
                        if (response.ok) {
                            const userData = await response.json();
                            if (userData.success && userData.user) {
                                this.userCache[userData.user.id] = userData.user;
                                // Only add to users array if not already present
                                if (!this.users.some(u => u.id === userData.user.id)) {
                                    this.users = [...this.users, userData.user];
                                }
                            }
                        }
                    } catch (error) {
                        console.debug('Error fetching user data for new message:', error);
                    }
                }

                // Update messages state
                this.messages = [...this.messages, messageData];
                await invalidate('chat:messages');
            } catch (error) {
                console.debug('Error parsing SSE message data:', error);
            }
        };

        this.eventSource.onerror = (event) => {
            console.debug('SSE encountered an error:', event);
            this.handleSSEError();
        };
    }

    private handleSSEError() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            console.debug(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
                this.reconnectAttempts++;
                this.reconnectDelay *= 2; // Exponential backoff
                this.connectSSE();
            }, this.reconnectDelay);
        } else {
            console.debug('Max reconnection attempts reached');
        }
    }

    private reconnectSSE() {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.connectSSE();
    }

    // Add new method to enrich multiple messages at once
    enrichMessages(messages: Message[]): EnrichedMessage[] {
        return messages.map(msg => this.enrichMessageWithUser(msg));
    }

    // Add new method to efficiently get user data for messages
    enrichMessageWithUser(message: Message): EnrichedMessage {
        const user = this.getUserById(message.senderId);
        return {
            ...message,
            user: user || {
                id: message.senderId,
                nickname: 'Unknown User',
                status: 'offline',
                password: '', // This is a system user, no password needed
                createdAt: Date.now(),
                lastSeen: null,
                avatarUrl: null
            }
        };
    }
}

// Export a singleton instance
export const chatState = new ChatState(); 