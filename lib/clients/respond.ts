import type { NextResponse } from 'next/server';
import { fail, type ErrorBody } from '@/lib/http';
import { isKaziRejected, isKaziUnavailable } from './fetcher';

const UNREACHABLE = 'Kazi Connect could not be reached. Try again in a minute.';

/**
 * Turns a failure from the Kazi client into OUR answer: Kazi down, slow or unreadable is our own 502; a
 * Kazi 400, 404 or 409 becomes our own 400, 404 or 409 with our own words. Anything else is not Kazi's
 * doing, so it is undefined and the caller rethrows.
 */
export function respondToKazi(
  err: unknown,
  messages: { 400?: string; 404?: string; 409?: string },
): NextResponse<ErrorBody> | undefined {
  if (isKaziUnavailable(err)) return fail(502, UNREACHABLE);
  if (isKaziRejected(err)) return fail(err.status, messages[err.status] ?? `Kazi Connect refused the request (${err.status})`);
  return undefined;
}
