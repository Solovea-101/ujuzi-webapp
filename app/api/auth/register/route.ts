import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/passwords';
import { startSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db';
import { isStoreConflict } from '@/lib/db/types';
import { fail, guarded, json, readJson } from '@/lib/http';
import { isoSeconds, toUser, type AuthResponse } from '@/lib/mappers';
import { parseNewUser } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** True when the invite code matches STAFF_INVITE_CODE. With no code configured nothing matches. */
function inviteCodeMatches(given: string): boolean {
  const configured = process.env.STAFF_INVITE_CODE;
  if (!configured) return false;
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(given), digest(configured));
}

// Endpoint 8 (G1): POST /api/auth/register. Anyone can make a graduate account; a staff account also
// needs a centre and the deployment's invite code, and is refused outright when none is configured.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const input = parseNewUser(parsed.body);
    if (!input.ok) return fail(400, input.message);
    const { role, email, password, firstName, lastName, centreId, inviteCode } = input.value;

    const store = await getStore();
    if (role === 'staff') {
      if (!process.env.STAFF_INVITE_CODE) return fail(403, 'Staff sign-up is closed on this deployment');
      if (!inviteCodeMatches(inviteCode ?? '')) return fail(403, 'That invite code is not valid');
      if (!(await store.getCentre(centreId ?? ''))) return fail(400, `centreId ${centreId} does not match any centre`);
    }

    try {
      const user = await store.createUser({
        role,
        email,
        password_hash: await hashPassword(password),
        first_name: firstName,
        last_name: lastName,
        centre_id: role === 'staff' ? (centreId ?? null) : null,
      });
      const { token, expiresAt } = await startSession(store, user.id);
      return json<AuthResponse>(201, { token, expiresAt: isoSeconds(expiresAt), user: toUser(user) });
    } catch (err) {
      if (isStoreConflict(err)) return fail(409, `An account with the email ${email} already exists`);
      throw err;
    }
  });
}
