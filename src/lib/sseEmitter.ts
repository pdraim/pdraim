type SSEEventData = {
    type: string;
    data: unknown;
};

class CustomEventEmitter {
    private listeners: Map<string, Array<(data: SSEEventData) => void>> = new Map();
    private maxListeners: number = 100;

    constructor() {
        console.log('[SSE-Emitter] Initialized');
    }

    emit(event: string, data: SSEEventData) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            // Only log non-sensitive event types
            if (!['userStatusUpdate', 'chatMessage'].includes(data.type)) {
                console.log('[SSE-Emitter] Broadcasting event:', { type: data.type, listenersCount: eventListeners.length });
            }
            eventListeners.forEach(listener => listener(data));
        }
    }

    addListener(event: string, listener: (data: SSEEventData) => void) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        const eventListeners = this.listeners.get(event)!;
        
        if (eventListeners.length >= this.maxListeners) {
            console.log(`[SSE-Emitter] Warning: Event '${event}' has exceeded the maximum number of listeners (${this.maxListeners})`);
        }
        
        eventListeners.push(listener);
        console.log('[SSE-Emitter] New listener added:', { event, totalListeners: eventListeners.length });
    }

    removeListener(event: string, listenerToRemove: (data: SSEEventData) => void) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const newListeners = eventListeners.filter(listener => listener !== listenerToRemove);
            this.listeners.set(event, newListeners);
            console.log('[SSE-Emitter] Listener removed:', { event, remainingListeners: newListeners.length });
        }
    }

    setMaxListeners(n: number) {
        this.maxListeners = n;
        console.log('[SSE-Emitter] Max listeners updated:', { newLimit: n });
    }
}

export const sseEmitter = new CustomEventEmitter(); 