import { NextResponse, type NextRequest } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Expose-Headers': 'Location',
  'Access-Control-Max-Age': '86400',
};

export function proxy(req: NextRequest) {
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }
  const res = NextResponse.next();
  for (const [name, value] of Object.entries(corsHeaders)) res.headers.set(name, value);
  return res;
}

export const config = { matcher: '/api/:path*' };
