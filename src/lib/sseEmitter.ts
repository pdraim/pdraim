import { EventEmitter } from 'events';

console.debug('Initializing shared SSE emitter');
export const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(100); 