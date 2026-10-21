import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/guards';
import { guarded, json } from '@/lib/http';
import { toUser, type User } from '@/lib/mappers';

export const dynamic = 'force-dynamic';

// Endpoint 11 (G1): GET /api/me
export async function GET(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireUser(req);
    if (!guard.ok) return guard.response;
    return json<User>(200, toUser(guard.user));
  });
}
