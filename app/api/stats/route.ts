import type { NextRequest } from 'next/server';
import { requirePartner } from '@/lib/auth/guards';
import { json } from '@/lib/http';
import { statsSnapshot } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

// Operations view (Week 12): GET /api/stats. Running totals since the server started: requests, 4xx and 5xx,
// error rate, average time, a breakdown per route, who called, and the state of the link to Kazi Connect.
// It needs a partner key like the rest of the partner API, and it holds no keys, query strings or bodies.
export async function GET(req: NextRequest) {
  const guard = requirePartner(req);
  if (!guard.ok) return guard.response;
  return json(200, statsSnapshot(), { 'Cache-Control': 'no-store' });
}
