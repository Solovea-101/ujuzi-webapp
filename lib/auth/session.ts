import { createHmac, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { SessionRow, Store, UserRow } from '@/lib/db/types';

export const SESSION_DAYS = 7;

let warnedAboutSecret = false;

/**
 * Tokens are stored only as an HMAC of the token under SESSION_SECRET, so a copy of the database is
 * not enough to log in as anyone. Changing the secret logs everyone out.
 */
export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET || 'change-me';
  if (secret === 'change-me' && process.env.NODE_ENV === 'production' && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn('SESSION_SECRET is not set (or is still "change-me"). Set a long random value in Render.');
  }
  return createHmac('sha256', secret).update(token).digest('hex');
}

const TOKEN = /^[0-9a-f]{64}$/;

/** A new login for a user: the token is returned once and only its hash is saved. */
export async function startSession(store: Store, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Math.floor((Date.now() + SESSION_DAYS * 86_400_000) / 1000) * 1000);
  await store.createSession({ token_hash: hashToken(token), user_id: userId, expires_at: expiresAt });
  return { token, expiresAt };
}

/** The token from "Authorization: Bearer TOKEN", if the header is there and the token looks like one of ours. */
export function bearerToken(req: NextRequest): string | undefined {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.get('authorization') ?? '');
  return match && TOKEN.test(match[1]) ? match[1] : undefined;
}

/** Who a token belongs to, or undefined for an unknown, logged-out or expired one (which is forgotten). */
export async function userForToken(store: Store, token: string): Promise<UserRow | undefined> {
  if (!TOKEN.test(token)) return undefined;
  const session: SessionRow | undefined = await store.getSession(hashToken(token));
  if (!session) return undefined;
  if (session.expires_at.getTime() <= Date.now()) {
    await store.deleteSession(session.token_hash);
    return undefined;
  }
  return store.getUser(session.user_id);
}
