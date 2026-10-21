import type { NextRequest, NextResponse } from 'next/server';
import { fail, type ErrorBody } from '@/lib/http';
import { hasValidPartnerKey } from './partnerKey';

/** Either the caller may go on, or here is the answer to send. */
export type Guard = { ok: true } | { ok: false; response: NextResponse<ErrorBody> };

/** The partner endpoints (Sherehe): a valid X-API-Key, checked before anything else, even the body. */
export function requirePartner(req: NextRequest): Guard {
  if (hasValidPartnerKey(req.headers.get('x-api-key'))) return { ok: true };
  return { ok: false, response: fail(401, 'Send your partner key as X-API-Key') };
}
