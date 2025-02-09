import type { User, ChatMessage } from '../types/chat';

// Mock users
const mockUsers: User[] = [
    {
        id: '1',
        nickname: 'CoolDude98',
        status: 'online',
        statusMessage: '🎮 Gaming all day!'
    },
    {
        id: '2',
        nickname: 'PixelPrincess',
        status: 'away',
        statusMessage: 'brb - food time'
    },
    {
        id: '3',
        nickname: 'WebSurfer2000',
        status: 'online',
        statusMessage: 'Surfing the information superhighway'
    },
    {
        id: '4',
        nickname: 'ChatBot3000',
        status: 'busy',
        statusMessage: '🤖 Computing...'
    }
];

// Mock initial messages
const initialMessages: ChatMessage[] = [
    {
        id: '1',
        userId: '1',
        content: 'sup everyone! who\'s up for some gaming?',
        timestamp: new Date(Date.now() - 300000),
        type: 'chat'
    },
    {
        id: '2',
        userId: '2',
        content: 'is getting a snack',
        timestamp: new Date(Date.now() - 240000),
        type: 'emote'
    },
    {
        id: '3',
        userId: '3',
        content: 'Just downloaded the new Internet Explorer 6! So fast! 🚀',
        timestamp: new Date(Date.now() - 180000),
        type: 'chat'
    },
    {
        id: '4',
        userId: '4',
        content: '*beep boop* Greetings humans!',
        timestamp: new Date(Date.now() - 120000),
        type: 'chat'
    }
];

// Helper function to generate message ID
const generateId = () => Math.random().toString(36).substring(2, 15);

class ChatState {
    private users = $state(mockUsers);
    private messages = $state(initialMessages);
    private currentUser = $state(mockUsers[0]);

    constructor() {
        // Initialize any necessary subscriptions or cleanup
    }

    // User methods
    getCurrentUser() {
        return this.currentUser;
    }

    getOnlineUsers() {
        return this.users.filter(user => user.status !== 'offline');
    }

    getUserById(userId: string) {
        return this.users.find(user => user.id === userId);
    }

    updateUserStatus(userId: string, status: User['status'], statusMessage?: string) {
        this.users = this.users.map(user => 
            user.id === userId 
                ? { ...user, status, ...(statusMessage && { statusMessage }) }
                : user
        );
    }

    // Message methods
    getMessages() {
        return this.messages;
    }

    sendMessage(content: string, type: ChatMessage['type'] = 'chat') {
        if (!this.currentUser) return;

        const newMessage: ChatMessage = {
            id: generateId(),
            userId: this.currentUser.id,
            content,
            timestamp: new Date(),
            type
        };

        this.messages = [...this.messages, newMessage];
    }

    // Add more methods as needed for your implementation
}

// Export a singleton instance
export const chatState = new ChatState(); 