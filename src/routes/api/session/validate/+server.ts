import { json } from '@sveltejs/kit';
import { validateSessionToken } from '$lib/api/session.server';

export async function GET({ cookies }) {
  const token = cookies.get('session');
  
  if (!token) {
    console.debug("No session token found in cookies.");
    return json({ session: null, user: null }, { status: 401 });
  }
  
  const result = await validateSessionToken(token);
  
  console.debug("Validate endpoint result:", result);
  
  return json(result);
} 