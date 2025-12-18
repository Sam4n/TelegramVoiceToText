import type { Session, SessionStatus, CollectedMessage } from '../types/session';

/**
 * Session TTL in seconds (30 minutes)
 */
const SESSION_TTL = 1800;

/**
 * Maximum number of messages per session
 */
export const MAX_MESSAGES_PER_SESSION = 10;

/**
 * Generate KV key for a session
 */
function getSessionKey(chatId: number): string {
  return `session:${chatId}`;
}

/**
 * Create a new session for a chat
 */
export async function createSession(
  kv: KVNamespace,
  chatId: number,
  userId: number
): Promise<Session> {
  const session: Session = {
    chatId,
    userId,
    status: 'collecting',
    messages: [],
    startTime: Date.now(),
  };

  const key = getSessionKey(chatId);
  await kv.put(key, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });

  return session;
}

/**
 * Get an existing session
 */
export async function getSession(
  kv: KVNamespace,
  chatId: number
): Promise<Session | null> {
  const key = getSessionKey(chatId);
  const data = await kv.get(key, 'json');

  return data as Session | null;
}

/**
 * Update an existing session
 */
export async function updateSession(
  kv: KVNamespace,
  chatId: number,
  session: Session
): Promise<void> {
  const key = getSessionKey(chatId);
  await kv.put(key, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
}

/**
 * Update session status
 */
export async function setSessionStatus(
  kv: KVNamespace,
  chatId: number,
  status: SessionStatus
): Promise<void> {
  const session = await getSession(kv, chatId);
  if (!session) {
    throw new Error('Session not found');
  }

  session.status = status;
  await updateSession(kv, chatId, session);
}

/**
 * Add a message to the session
 */
export async function addMessageToSession(
  kv: KVNamespace,
  chatId: number,
  message: CollectedMessage
): Promise<Session> {
  const session = await getSession(kv, chatId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'collecting') {
    throw new Error('Session is not in collecting state');
  }

  if (session.messages.length >= MAX_MESSAGES_PER_SESSION) {
    throw new Error(`Maximum ${MAX_MESSAGES_PER_SESSION} messages per session`);
  }

  session.messages.push(message);
  await updateSession(kv, chatId, session);

  return session;
}

/**
 * Delete a session
 */
export async function deleteSession(
  kv: KVNamespace,
  chatId: number
): Promise<void> {
  const key = getSessionKey(chatId);
  await kv.delete(key);
}

/**
 * Check if a session exists
 */
export async function sessionExists(
  kv: KVNamespace,
  chatId: number
): Promise<boolean> {
  const session = await getSession(kv, chatId);
  return session !== null;
}
