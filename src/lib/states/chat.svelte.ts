import type { User, Message, EnrichedMessage } from '../types/chat';
import type { 
    SendMessageRequest, 
    SendMessageResponse, 
    GetMessagesResponse 
} from '../types/payloads';
import { invalidate } from '$app/navigation';
import { DEFAULT_CHAT_ROOM_ID } from '$lib/db/schema';


class ChatState {
    private users = $state<User[]>([]);
    private messages = $state<Message[]>([]);
    private currentUser = $state<User | null>(null);
    private eventSource: EventSource | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private isInitializing = $state(false);
    private currentRoomId = $state<string>(DEFAULT_CHAT_ROOM_ID);
    private userCache = $state<Record<string, User>>({});
    private sseError = $state<string | null>(null);
    private sseRetryAfter = $state<number | null>(null);
    private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
    private isReconnecting = $state(false);

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
            // First set up SSE to receive status updates
            this.setupSSE();
            // Then initialize messages and room users
            await Promise.all([
                this.initializeMessages(),
                this.initializeRoomUsers()
            ]);
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
            // Add the current user to the cache immediately
            this.userCache[user.id] = user;
            // First set up SSE to receive status updates
            this.setupSSE();
            // Then initialize messages and room users
            await Promise.all([
                this.initializeMessages(),
                this.initializeRoomUsers()
            ]);
        } else {
            // If no global session, clear SSE and state
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            this.messages = [];
            this.users = [];
            this.userCache = {};
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
            // Merge fetched buddy list with existing cached users to preserve user details even if offline
            const mergedUsers = new Map<string, typeof data.buddyList[0]>();
            // Add existing cached users
            Object.values(this.userCache).forEach((user) => mergedUsers.set(user.id, user));

            // Overwrite/add with fetched buddy list
            data.buddyList.forEach((user: typeof data.buddyList[0]) => {
                mergedUsers.set(user.id, user);
            });

            this.users = Array.from(mergedUsers.values());

            // Update cache with merged users
            this.users.forEach(user => {
                this.userCache[user.id] = user;
            });
        } catch (error) {
            console.debug('Error fetching room users:', error);
            this.users = [];
        }
    }

    getOnlineUsers() {
        // Sort users by status: online first, then away, then busy, then offline
        return [...this.users].sort((a: User, b: User) => {
            const statusOrder: Record<User['status'], number> = {
                'online': 0,
                'away': 1,
                'busy': 2,
                'offline': 3
            };
            return statusOrder[a.status] - statusOrder[b.status];
        });
    }

    getUserById(userId: string) {
        // First check the cache
        if (this.userCache[userId]) {
            return this.userCache[userId];
        }

        // Return a fallback object and cache it to avoid repeated fetches
        const fallback = {
            id: userId,
            nickname: 'Unknown User',
            status: 'offline',
            password: '', // system user, no password needed
            createdAt: Date.now(),
            lastSeen: null,
            avatarUrl: null
        };
        this.userCache[userId] = fallback;
        console.debug('getUserById: returning fallback for missing user', { userId, fallback });
        return fallback;
    }

    updateUserStatus(userId: string, status: User['status'], lastSeen?: number) {
        console.debug('Updating user status with:', { userId, status, lastSeen, 
            currentCache: this.userCache[userId],
            currentUsers: this.users.find(u => u.id === userId)
        });

        // Try to get the user from cache first
        let user: User | undefined = this.userCache[userId];
        
        // If not in cache, try to find in users array
        if (!user) {
            const foundUser = this.users.find((u: User) => u.id === userId);
            if (foundUser) {
                user = foundUser;
            }
        }

        if (user) {
            const updatedUser: User = {
                ...user,
                status,
                lastSeen: status === 'offline' ? (lastSeen ?? Date.now()) : user.lastSeen
            };

            // Update cache first
            this.userCache[userId] = updatedUser;

            // Then update or add to users array
            const index = this.users.findIndex((u: User) => u.id === userId);
            if (index !== -1) {
                // Create new array with updated user
                this.users = [
                    ...this.users.slice(0, index),
                    updatedUser,
                    ...this.users.slice(index + 1)
                ];
            } else {
                this.users = [...this.users, updatedUser];
            }

            console.debug('User status updated:', {
                userId,
                newStatus: status,
                updatedInCache: this.userCache[userId].status === status,
                updatedInList: this.users.find(u => u.id === userId)?.status === status
            });
        } else {
            // If user not found anywhere, fetch from API
            console.debug('User not found in cache or list, fetching from API:', userId);
            fetch(`/api/users/${userId}`, { credentials: 'include' })
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.user) {
                        const newUser: User = {
                            ...data.user,
                            status,
                            lastSeen: status === 'offline' ? (lastSeen ?? Date.now()) : data.user.lastSeen
                        };
                        // Update both cache and users array
                        this.userCache[userId] = newUser;
                        this.users = [...this.users, newUser];
                        
                        console.debug('User fetched and status updated:', {
                            userId,
                            status: newUser.status,
                            addedToCache: !!this.userCache[userId],
                            addedToList: this.users.some(u => u.id === userId)
                        });
                    }
                })
                .catch(error => console.error('Error fetching user data:', error));
        }
    }

    // Message methods
    getMessages() {
        // Return messages with enriched user data
        return this.enrichMessages(this.messages);
    }

    // Add method to update user cache for public access
    updateUserCache(users: User[]) {
        // Merge incoming users with the existing cache
        const mergedUsers = new Map<string, User>();

        // Add all users from the existing cache
        Object.values(this.userCache).forEach(user => mergedUsers.set(user.id, user));

        // Merge with the new list of users
        users.forEach(user => mergedUsers.set(user.id, user));

        // Update this.users with all merged users
        this.users = Array.from(mergedUsers.values());

        // Update the cache as well
        mergedUsers.forEach((user, id) => { this.userCache[id] = user; });
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

    async sendMessage(content: string, type: Message['type'] = 'chat'): Promise<SendMessageResponse> {
        const user = this.getCurrentUser();
        if (!user) {
            console.debug('Cannot send message: No current user');
            return {
                success: false,
                error: 'Not logged in'
            };
        }
        
        try {
            const payload: SendMessageRequest = {
                content,
                type,
                userId: user.id,
                chatRoomId: DEFAULT_CHAT_ROOM_ID
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
            return data;
        } catch (error) {
            console.debug('Error sending message:', error);
            return {
                success: false,
                error: 'Failed to send message'
            };
        }
    }

    private setupSSE() {
        console.debug('Setting up SSE connection for chat messages');
        // Clear any existing connection timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        // Add a small delay before connecting to prevent rapid reconnection attempts
        this.connectionTimeout = setTimeout(() => {
            this.connectSSE();
        }, 500);
    }

    private connectSSE() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        if (this.isReconnecting) {
            console.debug('Already attempting to reconnect, skipping new connection attempt');
            return;
        }

        this.isReconnecting = true;
        console.debug('Connecting to SSE...');
        
        try {
            // Connect to the unified SSE endpoint
            this.eventSource = new EventSource('/api/sse', { withCredentials: true });

            // Default message event for handshake
            this.eventSource.onmessage = (event) => {
                if (event.data === 'Connected') {
                    console.debug('SSE connection established');
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    this.isReconnecting = false;
                    this.sseError = null;
                    this.sseRetryAfter = null;
                } else {
                    console.debug('Received unexpected default message:', event.data);
                }
            };

            // Listen for chat messages
            this.eventSource.addEventListener('chatMessage', async (event: MessageEvent) => {
                try {
                    const messageData = JSON.parse(event.data) as Message;
                    // Ensure the sender's data is available
                    if (!this.userCache[messageData.senderId]) {
                        console.debug('Fetching user data for new message:', messageData.senderId);
                        const response = await fetch(`/api/users/${messageData.senderId}`, { credentials: 'include' });
                        if (response.ok) {
                            const userData = await response.json();
                            if (userData.success && userData.user) {
                                this.userCache[userData.user.id] = userData.user;
                                if (!this.users.some(u => u.id === userData.user.id)) {
                                    this.users = [...this.users, userData.user];
                                }
                            }
                        }
                    }
                    this.messages = [...this.messages, messageData];
                    await invalidate('chat:messages');
                } catch (error) {
                    console.debug('Error parsing chatMessage SSE data:', error);
                }
            });

            // Listen for user status updates
            this.eventSource.addEventListener('userStatusUpdate', (event: MessageEvent) => {
                try {
                    const userUpdate = JSON.parse(event.data);
                    console.debug('Received SSE user status update:', userUpdate);
                    this.updateUserStatus(userUpdate.userId, userUpdate.status, userUpdate.lastSeen);
                } catch (error) {
                    console.debug('Error processing userStatusUpdate event:', error);
                }
            });

            this.eventSource.onerror = (event) => {
                console.debug('SSE encountered an error:', event);
                this.handleSSEError();
            };
        } catch (error) {
            console.debug('Error setting up SSE connection:', error);
            this.isReconnecting = false;
            this.handleSSEError();
        }
    }

    private async handleSSEError() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }

        // If we're already reconnecting, don't start another reconnection attempt
        if (this.isReconnecting) {
            console.debug('Already attempting to reconnect, skipping error handler');
            return;
        }

        // Check if the error was due to rate limiting
        try {
            const response = await fetch('/api/sse');
            if (response.status === 429) {
                const data = await response.json();
                this.sseError = data.error;
                this.sseRetryAfter = data.retryAfter;
                this.isReconnecting = false;
                
                // Set up automatic retry after the rate limit expires
                setTimeout(() => {
                    this.sseError = null;
                    this.sseRetryAfter = null;
                    this.reconnectSSE();
                }, (data.retryAfter + 1) * 1000); // Add 1 second buffer
                
                return;
            }
        } catch (error) {
            console.debug('Error checking SSE status:', error);
        }

        // Handle other types of errors with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.sseError = `Connection lost. Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`;
            console.debug(`Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`);
            
            setTimeout(() => {
                this.reconnectAttempts++;
                this.reconnectDelay *= 2; // Exponential backoff
                this.isReconnecting = false;
                this.connectSSE();
            }, this.reconnectDelay);
        } else {
            this.isReconnecting = false;
            this.sseError = 'Unable to connect to chat. Please refresh the page to try again.';
            console.debug('Max reconnection attempts reached');
        }
    }

    private reconnectSSE() {
        if (this.isReconnecting) {
            console.debug('Already attempting to reconnect, skipping reconnection request');
            return;
        }
        
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.sseError = null;
        this.sseRetryAfter = null;
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

    // Add getter for SSE error state
    public getSSEError() {
        return { error: this.sseError, retryAfter: this.sseRetryAfter };
    }
}

// Export a singleton instance
export const chatState = new ChatState(); 