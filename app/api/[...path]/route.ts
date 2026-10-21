import type { NextRequest } from 'next/server';
import { fail } from '@/lib/http';

type Context = { params: Promise<{ path: string[] }> };

// Anything under /api that no other route file claims: every error is { "message": "..." }.
async function notFound(req: NextRequest, { params }: Context) {
  const { path } = await params;
  return fail(404, `No endpoint ${req.method} /api/${path.join('/')}`);
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
