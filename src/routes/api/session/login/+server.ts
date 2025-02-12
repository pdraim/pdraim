import { json } from '@sveltejs/kit';
import { generateSessionToken, createSession } from '$lib/api/session.server';

export async function POST({ request, cookies }) {
  // For simplicity, assume the request includes the validated userId.
  const { userId } = await request.json();
  
  // Generate a secure token and create the session record.
  const token = generateSessionToken();
  const session = await createSession(token, userId);
  
  // Set the token as a cookie (adjust options as needed for production)
  cookies.set('session', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 // 24h expiry
  });
  
  console.debug("Login endpoint created session:", session);
  
  return json({ session });
} 