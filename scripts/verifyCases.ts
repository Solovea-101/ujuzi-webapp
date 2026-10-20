/**
 * The requests `npm run verify` sends. Each case names an operation exactly as openapi.yaml writes
 * it, the request, and the status the contract promises. verifyContract.ts checks the real answer
 * against the contract: status, then every field of the body. Values come from the seed data.
 *
 * Every built operation needs at least one case. Write cases (Week 6) will add a body and a
 * follow-up request, so each change is re-fetched and each rejected change is shown to change nothing.
 */
export interface VerifyCase {
  /** "METHOD /path" as written in openapi.yaml, e.g. "GET /api/courses/{courseId}". */
  operation: string;
  name: string;
  /** Path and query, e.g. /api/courses?category=catering. */
  request: string;
  status: number;
}

export const CASES: readonly VerifyCase[] = [
  { operation: 'GET /api/courses', name: 'every course', request: '/api/courses', status: 200 },
  { operation: 'GET /api/courses', name: 'by category', request: '/api/courses?category=catering', status: 200 },
  { operation: 'GET /api/courses', name: 'by county, in lower case', request: '/api/courses?county=nairobi', status: 200 },
  { operation: 'GET /api/courses', name: 'by category and county', request: '/api/courses?category=plumbing&county=Nairobi', status: 200 },
  { operation: 'GET /api/courses', name: 'nothing matches: [] with 200', request: '/api/courses?category=plumbing&county=Mombasa', status: 200 },
  { operation: 'GET /api/courses', name: 'unknown category', request: '/api/courses?category=cooking', status: 400 },
  { operation: 'GET /api/courses', name: 'empty category', request: '/api/courses?category=', status: 400 },
  { operation: 'GET /api/courses', name: 'unknown county', request: '/api/courses?county=Narnia', status: 400 },

  { operation: 'GET /api/courses/{courseId}', name: 'existing course', request: '/api/courses/crs_501', status: 200 },
  { operation: 'GET /api/courses/{courseId}', name: 'unknown course', request: '/api/courses/crs_999', status: 404 },

  { operation: 'GET /api/certificates/{certificateNo}', name: 'valid certificate', request: '/api/certificates/UJZ-2026-00123', status: 200 },
  { operation: 'GET /api/certificates/{certificateNo}', name: 'revoked certificate', request: '/api/certificates/UJZ-2026-00124', status: 200 },
  { operation: 'GET /api/certificates/{certificateNo}', name: 'unknown number', request: '/api/certificates/UJZ-2026-99999', status: 404 },
  { operation: 'GET /api/certificates/{certificateNo}', name: 'malformed number', request: '/api/certificates/UJZ-26-123', status: 400 },

  { operation: 'GET /api/bookings/{bookingId}', name: 'pending booking', request: '/api/bookings/bkg_6001', status: 200 },
  { operation: 'GET /api/bookings/{bookingId}', name: 'confirmed booking', request: '/api/bookings/bkg_6002', status: 200 },
  { operation: 'GET /api/bookings/{bookingId}', name: 'unknown booking', request: '/api/bookings/bkg_9999', status: 404 },
];
