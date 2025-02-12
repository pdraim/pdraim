import { json } from '@sveltejs/kit';
import { invalidateSession } from '$lib/api/session.server';
import { sha256 } from '$lib/api/session.server'; // re-use sha256 helper to compute session id

export async function POST({ cookies }) {
  const token = cookies.get('session');
  
  if (token) {
    const sessionId = await sha256(token);
    await invalidateSession(sessionId);
    cookies.delete('session', { path: '/' });
    console.debug("Logged out session with id:", sessionId);
  }
  
  return json({ success: true });
} 