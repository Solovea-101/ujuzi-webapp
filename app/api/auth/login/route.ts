import type { NextRequest } from 'next/server';
import { verifyAgainstDummy, verifyPassword } from '@/lib/auth/passwords';
import { startSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db';
import { fail, guarded, json, readJson } from '@/lib/http';
import { isoSeconds, toUser, type AuthResponse } from '@/lib/mappers';
import { parseCredentials } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 9 (G1): POST /api/auth/login. A wrong email and a wrong password get the same answer after
// the same amount of work, so the reply does not say which emails have accounts.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const credentials = parseCredentials(parsed.body);
    if (!credentials.ok) return fail(400, credentials.message);

    const store = await getStore();
    const user = await store.getUserByEmail(credentials.value.email);
    const matches = user
      ? await verifyPassword(credentials.value.password, user.password_hash)
      : await verifyAgainstDummy(credentials.value.password);
    if (!user || !matches) return fail(401, 'Email or password is wrong');

    const { token, expiresAt } = await startSession(store, user.id);
    return json<AuthResponse>(200, { token, expiresAt: isoSeconds(expiresAt), user: toUser(user) });
  });
}
