type SSEEventData = {
    type: string;
    data: unknown;
};

class CustomEventEmitter {
    private listeners: Map<string, Array<(data: SSEEventData) => void>> = new Map();
    private maxListeners: number = 100;

    constructor() {
        console.debug('Initializing custom SSE emitter');
    }

    emit(event: string, data: SSEEventData) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(listener => listener(data));
        }
    }

    addListener(event: string, listener: (data: SSEEventData) => void) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        const eventListeners = this.listeners.get(event)!;
        
        if (eventListeners.length >= this.maxListeners) {
            console.warn(`Warning: Event '${event}' has exceeded the maximum number of listeners (${this.maxListeners})`);
        }
        
        eventListeners.push(listener);
    }

    removeListener(event: string, listenerToRemove: (data: SSEEventData) => void) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            this.listeners.set(
                event,
                eventListeners.filter(listener => listener !== listenerToRemove)
            );
        }
    }

    setMaxListeners(n: number) {
        this.maxListeners = n;
    }
}

export const sseEmitter = new CustomEventEmitter(); 