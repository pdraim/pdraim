import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { TURSO_AUTH_TOKEN, TURSO_DATABASE_URL } from '$env/static/private';
import schema, { ensureDefaultChatRoom } from './schema';

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
const db = drizzle(client, { schema });

// Initialize database with required data
export const initializeDatabase = async () => {
    console.debug('Initializing database...');
    try {
        await ensureDefaultChatRoom(db);
        console.debug('Database initialization complete');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
};

// Call initialization when the module is loaded
initializeDatabase().catch(error => {
    console.error('Failed to initialize database:', error);
});

export const testConnection = async () => {
    const result = await db.query.users.findMany();
    console.log(result);
};

export default db;