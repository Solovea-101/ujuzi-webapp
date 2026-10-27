import type { NextResponse } from 'next/server';
import type { Store } from '@/lib/db/types';
import { json, type ErrorBody } from '@/lib/http';

const number = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Read on every call so it can be changed (and tested) without a restart. */
export const lockoutSettings = () => ({
  maxFailures: number('LOCKOUT_MAX_FAILURES', 5),
  windowMs: number('LOCKOUT_WINDOW_MINUTES', 15) * 60_000,
  lockMs: number('LOCKOUT_MINUTES', 15) * 60_000,
});

/** The key failures are counted under: the email, lower-cased, whether or not it has an account. */
export const lockoutKey = (email: string): string => email.trim().toLowerCase();

/**
 * The answer to send when this email is locked out, or undefined when it may try. The lock is on the
 * email address and is kept in the database, so a restart or a second server does not clear it, and an
 * email with no account is locked the same way, so the answer says nothing about who has an account.
 */
export async function lockedOut(store: Store, key: string): Promise<NextResponse<ErrorBody> | undefined> {
  const until = await store.getSignInLock(key, new Date());
  if (!until) return undefined;
  const seconds = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  return json(429, { message: `Too many failed sign-ins for this account. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` }, { 'Retry-After': String(seconds) });
}

/** Counts one failed sign-in; enough of them in a row lock the email for a while. */
export async function recordFailure(store: Store, key: string): Promise<void> {
  const { maxFailures, windowMs, lockMs } = lockoutSettings();
  await store.recordSignInFailure(key, new Date(), maxFailures, windowMs, lockMs);
}
