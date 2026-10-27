import { NextResponse, type NextRequest } from 'next/server';
import { rateLimitRequest } from '@/lib/rateLimit';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Expose-Headers': 'Location, Retry-After',
  'Access-Control-Max-Age': '86400',
};

export function proxy(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  // Rate limiting comes first, before authentication or anything else is looked at.
  const decision = rateLimitRequest(req.method, req.nextUrl.pathname, req.headers);
  if (!decision.allowed) {
    return NextResponse.json(
      { message: `Too many requests. Try again in ${decision.retryAfter} second${decision.retryAfter === 1 ? '' : 's'}.` },
      { status: 429, headers: { ...corsHeaders, 'Retry-After': String(decision.retryAfter) } },
    );
  }

  const res = NextResponse.next();
  for (const [name, value] of Object.entries(corsHeaders)) res.headers.set(name, value);
  return res;
}

export const config = { matcher: '/api/:path*' };
