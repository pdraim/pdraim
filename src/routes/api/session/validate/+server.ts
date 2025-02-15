import { json } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/api/session.server';
import { createLogger } from '$lib/utils/logger.server';

const log = createLogger('validate-server');

export async function GET({ cookies }) {
  const token = cookies.get('session');
  
  if (!token) {
    log.debug('No session token found in cookies');
    return json({ session: null, user: null }, { status: 401 });
  }
  
  const result = await validateSessionToken(token);
  
  if (result.session && result.user) {
    log.debug('Session validated', { 
      userId: `${result.user.id.slice(0, 4)}...${result.user.id.slice(-4)}`,
      sessionId: `${result.session.id.slice(0, 4)}...${result.session.id.slice(-4)}`
    });
  } else {
    log.debug('Invalid session token');
  }
  
  return json(result);
} 