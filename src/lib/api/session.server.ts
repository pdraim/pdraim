import db from '../db/db.server';
import { sessions, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { Session, User } from '../types/chat';
import { createLogger } from '../utils/logger.server';

const log = createLogger('session-server');

// Helper: Compute SHA-256 hash of a message and encode it as a hex string.
export async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Helper: Custom Base32 encoder using the standard alphabet.
// We use this instead of @oslojs/encoding given Cloudflare Pages compatibility.
const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i];
    bits += 8;
    while (bits >= 5) {
      const index = (value >>> (bits - 5)) & 0x1f;
      output += base32Alphabet[index];
      bits -= 5;
    }
  }
  if (bits > 0) {
    const index = (value << (5 - bits)) & 0x1f;
    output += base32Alphabet[index];
  }
  return output;
}

// Generate a secure session token by generating 20 random bytes and Base32 encoding them.
export function generateSessionToken(): string {
  const randomBytesArray = new Uint8Array(20);
  crypto.getRandomValues(randomBytesArray);
  const token = base32Encode(randomBytesArray);
  log.debug("Generated session token", { token });
  return token;
}

// Create a session record once a valid token is available.
// The session ID is the SHA-256 hash of the token.
export async function createSession(token: string, userId: string): Promise<Session> {
  log.debug("Creating session", { userId });
  const sessionId = await sha256(token);
  const createdAt = Date.now();
  const expiresAt = createdAt + 7 * 24 * 60 * 60 * 1000; // 7 days expiry
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    createdAt,
    expiresAt,
  });
  log.debug("Session created", { sessionId });
  return { id: sessionId, userId, createdAt, expiresAt };
}

/**
 * Type distributed through our API.
 * Returns an object with both session and user if valid, or nulls if not.
 * Note: This returns the full User type since it's used server-side in hooks.
 */
export type SessionValidationResult =
  | { session: Session; user: User }
  | { session: null; user: null };

// Validate a session token by converting it to its SHA‑256 hash, checking expiration, and fetching the user.
export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
  log.debug("Validating session token");
  const sessionId = await sha256(token);
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId)
  });
  if (!session) {
    log.debug("Session not found", { sessionId });
    return { session: null, user: null };
  }
  const now = Date.now();
  if (session.expiresAt < now) {
    log.debug("Session expired", { sessionId });
    return { session: null, user: null };
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId)
  });
  if (!user) {
    log.debug("User not found for session", { sessionId });
    return { session: null, user: null };
  }
  log.debug("Session validated", { sessionId, userId: user.id });
  return { session, user };
}

// Invalidate a specific session by deleting it from the database.
export async function invalidateSession(sessionId: string): Promise<void> {
  log.debug("Invalidating session", { sessionId });
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  log.debug("Session invalidated", { sessionId });
}

// Invalidate all sessions for a given user.
export async function invalidateAllSessions(userId: string): Promise<void> {
  log.debug("Invalidating all sessions for user", { userId });
  await db.delete(sessions).where(eq(sessions.userId, userId));
  log.debug("All sessions invalidated", { userId });
} 