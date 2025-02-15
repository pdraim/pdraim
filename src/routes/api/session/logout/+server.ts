import { json } from '@sveltejs/kit';
import { invalidateSession } from '$lib/api/session.server';
import { sha256 } from '$lib/api/session.server'; // re-use sha256 helper to compute session id
import { createLogger } from '$lib/utils/logger.server';

const log = createLogger('logout-server');

export async function POST({ cookies }) {
  const token = cookies.get('session');
  
  if (token) {
    const sessionId = await sha256(token);
    await invalidateSession(sessionId);
    cookies.delete('session', { path: '/' });
    log.info('Session invalidated', { sessionId: `${sessionId.slice(0, 4)}...${sessionId.slice(-4)}` });
  } else {
    log.debug('No session token found in cookies');
  }
  
  return json({ success: true });
} 