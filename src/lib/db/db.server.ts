import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '$env/static/private';
import schema, { ensureDefaultChatRoom } from './schema';
import { createLogger } from '$lib/utils/logger.server';

const log = createLogger('db-server');

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
const db = drizzle(client, { schema });

// Initialize database with required data
export const initializeDatabase = async () => {
    log.debug('Initializing database...');
    try {
        await ensureDefaultChatRoom(db);
        log.debug('Database initialization complete');
    } catch (error) {
        log.error('Error initializing database:', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw error;
    }
};

// Call initialization when the module is loaded
initializeDatabase().catch(error => {
    log.error('Failed to initialize database:', { error: error instanceof Error ? error.message : 'Unknown error' });
});

export const testConnection = async () => {
    const result = await db.query.users.findMany();
    log.debug('Test connection result:', result);
};

export default db;