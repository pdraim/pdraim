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
    private isSettingUser = $state(false);
    private isConnecting = $state(false);
    private connectionAttemptTimeout: ReturnType<typeof setTimeout> | null = null;
    private _memoizedEnrichedMessages: EnrichedMessage[] | null = null;
    private _lastEnrichmentKey: string = '';

    public async reinitialize() {
        if (this.isInitializing) {
            console.debug('Reinitialize already in progress, skipping.');
            return;
        }
        this.isInitializing = true;
        console.debug('Reinitializing chat state...');
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.messages = [];
        if (this.currentUser) {
            console.debug('Waiting for session cookie update before setting up SSE...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            // First set up SSE to receive status updates
            this.setupSSE();
            // Then initialize messages and room users
            await Promise.all([
                this.initializeMessages(),
                this.initializeRoomUsers()
            ]);
        }
        this.isInitializing = false;
    }

    getSSEError() {
        return {
            error: this.sseError,
            retryAfter: this.sseRetryAfter
        };
    }

    // User methods
    getCurrentUser() {
        return this.currentUser;
    }

    async setCurrentUser(user: User | null) {
        console.debug('setCurrentUser called with', user);
        
        // Prevent concurrent setCurrentUser calls
        if (this.isSettingUser) {
            console.debug('Already setting user, skipping');
            return;
        }
        
        this.isSettingUser = true;
        
        try {
            // If user is null and we already have no user, skip
            if (!user && !this.currentUser) {
                console.debug('No user to set and no current user, skipping');
                return;
            }
            
            // If same user is being set, check SSE connection
            if (user?.id === this.currentUser?.id) {
                if (!this.eventSource) {
                    console.debug('Same user being set but no active SSE connection, reinitializing.');
                } else {
                    console.debug('Same user being set with active connection, skipping.');
                    return;
                }
            }
            
            this.currentUser = user;
            
            if (user) {
                // Update user cache with current user
                this.userCache[user.id] = user;
                
                // Only reinitialize if we have a valid user
                await this.reinitialize();
            } else {
                // Cleanup when user is removed
                if (this.eventSource) {
                    this.eventSource.close();
                    this.eventSource = null;
                }
                this.messages = [];
                this.users = [];
                this.userCache = {};
            }
        } finally {
            this.isSettingUser = false;
        }
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
        console.debug('Updating user status with:', { 
            userId, 
            status, 
            lastSeen,
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

        const now = Date.now();
        if (user) {
            const updatedUser: User = {
                ...user,
                status,
                // Update lastSeen based on status
                lastSeen: lastSeen ?? (status === 'offline' ? now : user.lastSeen)
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
                newLastSeen: new Date(updatedUser.lastSeen || now).toISOString(),
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
                            lastSeen: lastSeen ?? (status === 'offline' ? now : data.user.lastSeen)
                        };
                        // Update both cache and users array
                        this.userCache[userId] = newUser;
                        this.users = [...this.users, newUser];
                        
                        console.debug('User fetched and status updated:', {
                            userId,
                            status: newUser.status,
                            lastSeen: new Date(newUser.lastSeen || now).toISOString(),
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
        const key = this.messages.map(m => m.id).join(',') + '|' + Object.keys(this.userCache).sort().join(',');
        if (key === this._lastEnrichmentKey && this._memoizedEnrichedMessages !== null) {
            return this._memoizedEnrichedMessages;
        }
        this._lastEnrichmentKey = key;
        console.debug('Enriching messages with user data', {
            messagesCount: this.messages.length,
            userCacheSize: Object.keys(this.userCache).length
        });
        this._memoizedEnrichedMessages = this.enrichMessages(this.messages);
        return this._memoizedEnrichedMessages;
    }

    public prependMessages(newMessages: Message[]) {
        console.debug('Prepending messages:', { count: newMessages.length });
        // Get unique user IDs from new messages that aren't in the cache
        const uniqueUserIds = new Set(newMessages.map(msg => msg.senderId));
        const missingUserIds = Array.from(uniqueUserIds).filter(id => !this.userCache[id]);

        // Fetch missing user data in parallel
        if (missingUserIds.length > 0) {
            console.debug('Fetching missing user data for IDs:', missingUserIds);
            Promise.all(missingUserIds.map(async (userId) => {
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

        // Prepend new messages while maintaining uniqueness
        const uniqueNewMessages = newMessages.filter(msg => !this.messages.some(m => m.id === msg.id));
        this.messages = [...uniqueNewMessages, ...this.messages];
    }

    // Add method to update user cache for public access
    updateUserCache(users: User[]) {
        console.debug('Updating user cache with users:', users);
        // Merge incoming users with the existing cache
        users.forEach(user => {
            if (!this.userCache[user.id] || user.status !== this.userCache[user.id].status) {
                this.userCache[user.id] = user;
                // Update users array if not already present or if status changed
                const existingIndex = this.users.findIndex(u => u.id === user.id);
                if (existingIndex === -1) {
                    this.users = [...this.users, user];
                } else if (user.status !== this.users[existingIndex].status) {
                    this.users = [
                        ...this.users.slice(0, existingIndex),
                        user,
                        ...this.users.slice(existingIndex + 1)
                    ];
                }
            }
        });
    }

    // Add method to update online users for public access
    updateOnlineUsers(users: User[]) {
        console.debug('Updating online users:', users);
        this.users = users;
        // Also update cache
        users.forEach(user => {
            this.userCache[user.id] = user;
        });
    }

    // Add method to update messages for public access
    updateMessages(messages: Message[]) {
        // Deduplicate the messages by their id in case duplicates exist
        const uniqueMessages = Array.from(new Map(messages.map(msg => [msg.id, msg])).values());
        this.messages = uniqueMessages;
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
        
        // Clear any existing timeouts
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        if (this.connectionAttemptTimeout) {
            clearTimeout(this.connectionAttemptTimeout);
            this.connectionAttemptTimeout = null;
        }
        
        // Debounce connection attempts
        this.connectionAttemptTimeout = setTimeout(() => {
            if (!this.currentUser) {
                console.debug('No current user, skipping SSE connection');
                return;
            }
            
            if (this.isConnecting) {
                console.debug('Already connecting to SSE, skipping');
                return;
            }
            
            this.connectSSE();
        }, 1000);
    }

    private async connectSSE() {
        if (this.isConnecting) {
            console.debug('Already connecting to SSE, skipping');
            return;
        }
        
        this.isConnecting = true;
        
        try {
            // Ensure clean disconnect of any existing connection
            if (this.eventSource) {
                console.debug('Closing existing SSE connection');
                this.eventSource.close();
                this.eventSource = null;
            }
            
            console.debug('Connecting to SSE...');
            this.eventSource = new EventSource('/api/sse', { withCredentials: true });
            
            this.eventSource.onopen = () => {
                console.debug('SSE connection established');
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.sseError = null;
                this.sseRetryAfter = null;
                this.isReconnecting = false;
            };
            
            // Set up error handling
            this.eventSource.onerror = (error) => {
                console.debug('SSE connection error:', error);
                if (this.eventSource?.readyState === EventSource.CLOSED) {
                    this.handleDisconnection();
                }
            };
            
            // Set up message handling
            this.setupMessageHandlers(this.eventSource);
            
        } catch (error) {
            console.debug('Error setting up SSE connection:', error);
            this.handleDisconnection();
        } finally {
            this.isConnecting = false;
        }
    }

    private setupMessageHandlers(eventSource: EventSource) {
        // Listen for chat messages
        eventSource.addEventListener('chatMessage', async (event: MessageEvent) => {
            try {
                const messageData = JSON.parse(event.data) as Message;
                console.debug('Received chat message via SSE:', messageData);
                // Deduplicate and update messages array with the new message
                this.messages = Array.from(new Map([...this.messages, messageData].map(m => [m.id, m])).values());
                
                // Ensure the sender's data is available
                await this.ensureUserData(messageData.senderId);
            } catch (error) {
                console.debug('Error handling SSE chat message:', error);
            }
        });
    }

    private async ensureUserData(userId: string) {
        if (this.userCache[userId]) return;
        
        console.debug('Fetching user data for:', userId);
        try {
            const response = await fetch(`/api/users/${userId}`, {
                credentials: 'include'
            });
            if (response.ok) {
                const userData = await response.json();
                if (userData.success && userData.user) {
                    this.userCache[userId] = userData.user;
                    if (!this.users.some(u => u.id === userId)) {
                        this.users = [...this.users, userData.user];
                    }
                }
            }
        } catch (error) {
            console.debug('Error fetching user data:', error);
        }
    }

    private handleDisconnection() {
        console.debug('SSE connection closed, reconnecting...');
        this.isReconnecting = true;
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            console.debug('Max reconnect attempts reached, giving up');
            this.eventSource = null;
            return;
        }
        this.reconnectDelay *= 2; // Exponential backoff
        this.setupSSE();
    }

    enrichMessages(messages: Message[]): EnrichedMessage[] {
        console.debug('Enriching messages with user data', { messagesCount: messages.length, userCacheSize: Object.keys(this.userCache).length });
        return messages.map(message => ({
            ...message,
            user: this.userCache[message.senderId] || { 
                id: message.senderId,
                nickname: 'Unknown User',
                status: 'offline',
                password: '',
                createdAt: 0
            }
        }));
    }
}

export const chatState = new ChatState();