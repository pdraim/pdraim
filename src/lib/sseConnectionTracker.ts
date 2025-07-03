import { createLogger } from './utils/logger.server';

const log = createLogger('sse-connection-tracker');

interface ConnectionInfo {
    userId: string;
    connectedAt: number;
    lastActivity: number;
}

class SSEConnectionTracker {
    private connections = new Map<string, ConnectionInfo>();
    
    addConnection(userId: string): boolean {
        const existing = this.connections.get(userId);
        if (existing) {
            log.debug('User already has active connection', { userId });
            // Update last activity but don't trigger status update
            existing.lastActivity = Date.now();
            return false; // Connection already exists
        }
        
        this.connections.set(userId, {
            userId,
            connectedAt: Date.now(),
            lastActivity: Date.now()
        });
        
        log.debug('New SSE connection tracked', { 
            userId, 
            totalConnections: this.connections.size 
        });
        return true; // New connection
    }
    
    removeConnection(userId: string): boolean {
        const deleted = this.connections.delete(userId);
        if (deleted) {
            log.debug('SSE connection removed', { 
                userId, 
                remainingConnections: this.connections.size 
            });
        }
        return deleted;
    }
    
    hasConnection(userId: string): boolean {
        return this.connections.has(userId);
    }
    
    updateActivity(userId: string): void {
        const connection = this.connections.get(userId);
        if (connection) {
            connection.lastActivity = Date.now();
        }
    }
    
    getActiveUserIds(): string[] {
        return Array.from(this.connections.keys());
    }
    
    getConnectionCount(): number {
        return this.connections.size;
    }
    
    // Clean up stale connections (e.g., if server didn't properly close them)
    cleanupStaleConnections(maxInactivityMs: number = 5 * 60 * 1000): string[] {
        const now = Date.now();
        const staleUserIds: string[] = [];
        
        for (const [userId, info] of this.connections.entries()) {
            if (now - info.lastActivity > maxInactivityMs) {
                this.connections.delete(userId);
                staleUserIds.push(userId);
            }
        }
        
        if (staleUserIds.length > 0) {
            log.info('Cleaned up stale connections', { 
                count: staleUserIds.length,
                userIds: staleUserIds
            });
        }
        
        return staleUserIds;
    }
}

// Export singleton instance
export const sseConnectionTracker = new SSEConnectionTracker();