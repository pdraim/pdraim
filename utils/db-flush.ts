import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
    throw new Error('Missing required environment variables TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN');
}

async function flushDatabase() {
    console.log('Starting database content flush...');
    
    const client = createClient({ 
        url: TURSO_DATABASE_URL as string, 
        authToken: TURSO_AUTH_TOKEN as string 
    });

    try {
        // Clear tables in correct order to respect foreign key constraints
        console.log('Clearing messages table...');
        await client.execute('DELETE FROM messages');
        
        console.log('Clearing sessions table...');
        await client.execute('DELETE FROM sessions');
        
        console.log('Clearing chat rooms table...');
        await client.execute('DELETE FROM chat_rooms');
        
        console.log('Clearing users table...');
        await client.execute('DELETE FROM users');

        console.log('Database content flush completed successfully');
    } catch (error) {
        console.error('Error flushing database content:', error);
        throw error;
    } finally {
        await client.close();
    }
}

// Execute if this file is run directly
if (new URL(import.meta.url).pathname === process.argv[1]) {
    flushDatabase()
        .then(() => {
            console.debug('[db-flush] Exiting process with code 0');
            process.exit(0);
        })
        .catch((error) => {
            console.error('[db-flush] Failed to flush database content:', error);
            process.exit(1);
        });
} 