import type { NextRequest } from 'next/server';
import { fail, guarded } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Endpoint 19 (G3): the applications feed is a WebSocket, served from server.ts (route handlers cannot
// accept an upgrade). A plain HTTP GET lands here and is told so, as Kazi does for its own socket.
export async function GET(_req: NextRequest) {
  return guarded(async () => {
    const res = fail(426, 'Connect to this endpoint with a WebSocket client');
    res.headers.set('Upgrade', 'websocket');
    return res;
  });
}
