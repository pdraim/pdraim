import type { User, Message, EnrichedMessage, SafeUser } from '../types/chat';
import { createSafeUser } from '../types/chat';
import type { 
    SendMessageRequest, 
    SendMessageResponse, 
    GetMessagesResponse 
} from '../types/payloads';
import { invalidate } from '$app/navigation';
import { env } from '$env/dynamic/public';

// Use the public environment variable with a fallback
const DEFAULT_CHAT_ROOM_ID = env.PUBLIC_DEFAULT_CHAT_ROOM_ID || '00000000-0000-0000-0000-000000000001';

class ChatState {
    private users = $state<SafeUser[]>([]);
    private messages = $state<Message[]>([]);
    private currentUser = $state<SafeUser | null>(null);
    private eventSource: EventSource | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private isInitializing = $state(false);
    private currentRoomId = $state<string>(DEFAULT_CHAT_ROOM_ID);
    private userCache = $state<Record<string, SafeUser>>({});
    private sseError = $state<string | null>(null);
    private sseRetryAfter = $state<number | null>(null);
    private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
    private isReconnecting = $state(false);
    private isSettingUser = $state(false);
    private isConnecting = $state(false);
    private connectionAttemptTimeout: ReturnType<typeof setTimeout> | null = null;
    private _memoizedEnrichedMessages: EnrichedMessage[] | null = null;
    private _lastEnrichmentKey: string = '';
    // Flag to avoid re-registering SSE event handlers
    private sseHandlersRegistered = false;
    private lastBuddyListUpdate = 0;
    private lastBuddyListHash = '';
    private hasMoreMessages = $state(false);
    private publicPollingInterval: ReturnType<typeof setInterval> | null = null;

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
        // Ensure currentRoomId is set
        this.currentRoomId = DEFAULT_CHAT_ROOM_ID;
        
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

    async setCurrentUser(user: User | SafeUser | null) {
        console.debug('setCurrentUser called with', user ? { ...user, password: '[REDACTED]' } : null);
        
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

            // Convert to SafeUser if full User object is passed
            const safeUser = user ? ('password' in user ? createSafeUser(user) : user) : null;
            
            // If same user is being set, check SSE connection
            if (safeUser?.id === this.currentUser?.id) {
                if (!this.eventSource) {
                    console.debug('Same user being set but no active SSE connection, reinitializing.');
                } else {
                    console.debug('Same user being set with active connection, skipping.');
                    return;
                }
            }
            
            // Clear existing messages before setting new user
            this.messages = [];
            this.currentUser = safeUser;
            
            if (safeUser) {
                // Update user cache with current user
                this.userCache[safeUser.id] = safeUser;
                
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
            const isPublic = !this.currentUser;
            const url = `/api/rooms/${this.currentRoomId}${isPublic ? '?public=true' : ''}`;
            console.debug('Fetching room users from:', url);
            
            const response = await fetch(url, {
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
        return [...this.users].sort((a: SafeUser, b: SafeUser) => {
            const statusOrder: Record<SafeUser['status'], number> = {
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
        const fallback: SafeUser = {
            id: userId,
            nickname: 'Unknown User',
            status: 'offline',
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

        const existingUser = this.userCache[userId];
        if (
            existingUser &&
            existingUser.status === status &&
            lastSeen &&
            Math.abs(existingUser.lastSeen ?? 0 - lastSeen) < 5000
        ) {
            console.debug('Skipping redundant status update for user:', userId);
            return;
        }
        
        // Try to get the user from cache first
        let user: SafeUser | undefined = this.userCache[userId];
        
        // If not in cache, try to find in users array
        if (!user) {
            const foundUser = this.users.find((u: SafeUser) => u.id === userId);
            if (foundUser) {
                user = foundUser;
            }
        }
        
        const now = Date.now();
        if (user) {
            const updatedUser: SafeUser = {
                ...user,
                status,
                lastSeen: lastSeen ?? (status === 'offline' ? now : user.lastSeen)
            };
            
            // Update cache first
            this.userCache[userId] = updatedUser;
            
            // Then update or add to users array
            const index = this.users.findIndex((u: SafeUser) => u.id === userId);
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
                        const newUser: SafeUser = {
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

    public prependMessages(newMessages: Message[], hasMore?: boolean) {
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

        // Ensure incoming messages are sorted in ascending order before prepending
        const sortedNewMessages = newMessages.slice().sort((a, b) => a.timestamp - b.timestamp);
        const uniqueNewMessages = sortedNewMessages.filter(msg => !this.messages.some(m => m.id === msg.id));
        this.messages = [...uniqueNewMessages, ...this.messages];
        
        // Update hasMore if provided
        if (hasMore !== undefined) {
            this.hasMoreMessages = hasMore;
        }
    }

    // Add method to update user cache for public access
    updateUserCache(users: (User | SafeUser)[]) {
        console.debug('Updating user cache with users:', users.map(u => ({ ...u, password: '[REDACTED]' })));
        // Merge incoming users with the existing cache, ensuring we only store SafeUser objects
        users.forEach(user => {
            const safeUser = 'password' in user ? createSafeUser(user) : user;
            if (!this.userCache[user.id] || safeUser.status !== this.userCache[user.id].status) {
                this.userCache[user.id] = safeUser;
                // Update users array if not already present or if status changed
                const existingIndex = this.users.findIndex(u => u.id === user.id);
                if (existingIndex === -1) {
                    this.users = [...this.users, safeUser];
                } else if (safeUser.status !== this.users[existingIndex].status) {
                    this.users = [
                        ...this.users.slice(0, existingIndex),
                        safeUser,
                        ...this.users.slice(existingIndex + 1)
                    ];
                }
            }
        });
    }

    // Add method to update online users for public access
    updateOnlineUsers(users: (User | SafeUser)[]) {
        const now = Date.now();
        // Convert all users to SafeUser and create a hash
        const safeUsers = users.map(user => 'password' in user ? createSafeUser(user) : user);
        const newHash = JSON.stringify(safeUsers);
        
        // Only update if the data has changed
        if (newHash !== this.lastBuddyListHash) {
            const statusCounts = safeUsers.reduce((acc, user) => {
                acc[user.status] = (acc[user.status] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            console.debug('Updating online users (data changed):', {
                total: safeUsers.length,
                byStatus: statusCounts,
                timestamp: new Date(now).toISOString()
            });

            this.users = safeUsers;
            // Also update cache
            safeUsers.forEach(user => {
                this.userCache[user.id] = user;
            });
            this.lastBuddyListHash = newHash;
            this.lastBuddyListUpdate = now;
        }
    }

    // Add method to update messages for public access
    updateMessages(messages: Message[]) {
        // Deduplicate the messages by their id in case duplicates exist
        const uniqueMessages = Array.from(new Map(messages.map(msg => [msg.id, msg])).values());
        // Sort messages in ascending order (oldest first, newest at bottom)
        this.messages = uniqueMessages.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Note: For authenticated users, we no longer use the message cache. Messages are fetched directly from the database, and real-time updates are handled via SSE.
    async initializeMessages() {
        try {
            // Build the URL with appropriate parameters
            const params = new URLSearchParams();
            if (!this.currentUser) {
                params.append('public', 'true');
            }
            params.append('roomId', this.currentRoomId);

            const response = await fetch(`/api/chat/messages?${params}`, {
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

            // Sort messages in ascending order (oldest first, most recent at the bottom)
            this.messages = data.messages.slice().sort((a, b) => a.timestamp - b.timestamp);
            
            // Update hasMore based on response
            if ('hasMore' in data) {
                this.hasMoreMessages = data.hasMore;
            }

            console.debug('Messages initialized:', {
                count: data.messages.length,
                isAuthenticated: !!this.currentUser,
                hasMore: this.hasMoreMessages
            });
        } catch (error) {
            console.debug('Error fetching initial messages:', error);
            this.messages = [];
            this.hasMoreMessages = false;
        }
    }

    async sendMessage(content: string, type: Message['type'] = 'chat', textStyle?: any): Promise<SendMessageResponse> {
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
            
            // Add styleData if textStyle is provided
            if (textStyle) {
                (payload as any).styleData = JSON.stringify(textStyle);
            }

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
        // Prevent creating multiple SSE connections if one is already active.
        if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
            console.debug('setupSSE: Active SSE connection exists, skipping setup.');
            return;
        }
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
            // Reset the handlers flag for the new connection
            this.sseHandlersRegistered = false;
            
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
            
            // Register event handlers (only once)
            this.setupMessageHandlers();
            
        } catch (error) {
            console.debug('Error setting up SSE connection:', error);
            this.handleDisconnection();
        } finally {
            this.isConnecting = false;
        }
    }

    // Register SSE event handlers only once per connection.
    private setupMessageHandlers() {
        if (this.sseHandlersRegistered || !this.eventSource) {
            return;
        }

        // Listen for chat messages
        this.eventSource.addEventListener('chatMessage', async (event: MessageEvent) => {
            try {
                const messageData = JSON.parse(event.data) as Message;
                console.debug('Received chat message via SSE:', messageData);
                // Deduplicate and update messages array with the new message
                this.messages = Array.from(new Map([...this.messages, messageData].map(m => [m.id, m])).values());
                // Sort messages so the newest are at the bottom
                this.messages.sort((a, b) => a.timestamp - b.timestamp);
                // Ensure the sender's data is available
                await this.ensureUserData(messageData.senderId);
            } catch (error) {
                console.debug('Error handling SSE chat message:', error);
            }
        });
        
        // Modify buddy list update handler
        this.eventSource.addEventListener('buddyListUpdate', async (event: MessageEvent) => {
            try {
                const buddyList = JSON.parse(event.data) as SafeUser[];
                this.updateOnlineUsers(buddyList);
            } catch (error) {
                console.debug('Error handling buddy list update via SSE:', error);
            }
        });

        this.sseHandlersRegistered = true;
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
            if (this.eventSource) {
                this.eventSource.close();
            }
            this.eventSource = null;
            return;
        }
        this.reconnectDelay *= 2; // Exponential backoff
        // Ensure any existing connection is properly closed before reconnecting
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        // Reset the handlers flag so that the new connection gets its event listeners registered fresh.
        this.sseHandlersRegistered = false;
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
                avatarUrl: null,
                lastSeen: null
            }
        }));
    }

    getDefaultChatRoomId() {
        return DEFAULT_CHAT_ROOM_ID;
    }
}

export const chatState = new ChatState();