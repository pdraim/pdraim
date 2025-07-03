import { createLogger } from './utils/logger.server';
import type { SafeUser } from './types/chat';

const log = createLogger('buddy-list-cache');

class BuddyListCache {
    private cache: SafeUser[] | null = null;
    private lastHash: string = '';
    private lastFetch: number = 0;
    private isDirty: boolean = true; // Force initial fetch
    
    // Mark cache as needing refresh
    invalidate(): void {
        this.isDirty = true;
        log.debug('Buddy list cache invalidated');
    }
    
    // Check if we need to fetch new data
    needsRefresh(): boolean {
        return this.isDirty || this.cache === null;
    }
    
    // Update cache with new data
    update(users: SafeUser[]): boolean {
        const newHash = JSON.stringify(users);
        const hasChanged = newHash !== this.lastHash;
        
        if (hasChanged) {
            this.cache = users;
            this.lastHash = newHash;
            this.lastFetch = Date.now();
            this.isDirty = false;
            
            log.debug('Buddy list cache updated', {
                userCount: users.length,
                changed: hasChanged
            });
        }
        
        return hasChanged;
    }
    
    // Get cached data
    get(): SafeUser[] | null {
        return this.cache;
    }
    
    // Get cache age in milliseconds
    getAge(): number {
        return this.cache ? Date.now() - this.lastFetch : Infinity;
    }
}

// Export singleton instance
export const buddyListCache = new BuddyListCache();