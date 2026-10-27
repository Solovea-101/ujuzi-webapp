import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/guards';
import { lockedOut, lockoutKey, recordFailure } from '@/lib/auth/lockout';
import { hashPassword, verifyPassword } from '@/lib/auth/passwords';
import { hashToken } from '@/lib/auth/session';
import { getStore } from '@/lib/db';
import { fail, guarded, noContent, readJson } from '@/lib/http';
import { parsePasswordChange } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 25 (G1): POST /api/auth/password. A logged in user changes their own password. Order: login (401),
// body (400, 413), too many wrong passwords lately (429), the current password (403). Every other login of
// the user ends at once; the one that made the request stays. A wrong current password counts towards the same
// lock as a wrong sign-in, so a stolen login token cannot be used to guess the password.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireUser(req);
    if (!guard.ok) return guard.response;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const change = parsePasswordChange(parsed.body);
    if (!change.ok) return fail(400, change.message);

    const store = await getStore();
    const key = lockoutKey(guard.user.email);
    const locked = await lockedOut(store, key);
    if (locked) return locked;
    if (!(await verifyPassword(change.value.currentPassword, guard.user.password_hash))) {
      await recordFailure(store, key);
      return fail(403, 'The current password is wrong');
    }
    await store.updateUserPassword(guard.user.id, await hashPassword(change.value.newPassword));
    await store.deleteSessionsForUser(guard.user.id, hashToken(guard.token));
    await store.clearSignInFailures(key);
    return noContent();
  });
}
