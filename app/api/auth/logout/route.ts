import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/guards';
import { hashToken } from '@/lib/auth/session';
import { getStore } from '@/lib/db';
import { guarded, noContent } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Endpoint 10 (G1): POST /api/auth/logout. The token stops working at once.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireUser(req);
    if (!guard.ok) return guard.response;
    await (await getStore()).deleteSession(hashToken(guard.token));
    return noContent();
  });
}
