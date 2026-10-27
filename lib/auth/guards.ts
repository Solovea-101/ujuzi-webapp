import type { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import type { UserRow } from '@/lib/db/types';
import { fail, type ErrorBody } from '@/lib/http';
import { hasValidPartnerKey, partnerForKey } from './partnerKey';
import { bearerToken, userForToken } from './session';

/** Either the caller may go on, or here is the answer to send. */
export type Guard = { ok: true } | { ok: false; response: NextResponse<ErrorBody> };
export type UserGuard = { ok: true; user: UserRow; token: string } | { ok: false; response: NextResponse<ErrorBody> };

const NEEDS_LOGIN = 'Log in and send Authorization: Bearer YOUR_TOKEN';

export type PartnerGuard = { ok: true; partner: string } | { ok: false; response: NextResponse<ErrorBody> };

/** The partner endpoints (Sherehe): a valid X-API-Key, checked before anything else, even the body. */
export function requirePartner(req: NextRequest): PartnerGuard {
  const partner = partnerForKey(req.headers.get('x-api-key'));
  if (partner) return { ok: true, partner };
  return { ok: false, response: fail(401, 'Send your partner key as X-API-Key') };
}

/** A logged in graduate or staff member. */
export async function requireUser(req: NextRequest): Promise<UserGuard> {
  const token = bearerToken(req);
  const user = token ? await userForToken(await getStore(), token) : undefined;
  if (!token || !user) return { ok: false, response: fail(401, NEEDS_LOGIN) };
  return { ok: true, user, token };
}

/** A logged in staff member (always attached to a centre). */
export async function requireStaff(req: NextRequest): Promise<UserGuard> {
  const guard = await requireUser(req);
  if (!guard.ok) return guard;
  if (guard.user.role !== 'staff') return { ok: false, response: fail(403, 'Only staff can do this') };
  return guard;
}

/** A logged in graduate. */
export async function requireGraduate(req: NextRequest): Promise<UserGuard> {
  const guard = await requireUser(req);
  if (!guard.ok) return guard;
  if (guard.user.role !== 'graduate') return { ok: false, response: fail(403, 'Only graduates can do this') };
  return guard;
}

/** The course and certificate reads: a partner key, or the login token of the website's own pages. */
export async function requirePartnerOrUser(req: NextRequest): Promise<Guard> {
  if (hasValidPartnerKey(req.headers.get('x-api-key'))) return { ok: true };
  const token = bearerToken(req);
  if (token && (await userForToken(await getStore(), token))) return { ok: true };
  return {
    ok: false,
    response: fail(401, 'Send your partner key as X-API-Key, or log in and send Authorization: Bearer YOUR_TOKEN'),
  };
}
