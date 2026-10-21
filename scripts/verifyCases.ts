/**
 * The requests `npm run verify` sends. Each case names an operation exactly as openapi.yaml writes
 * it, the request, and the status the contract promises. verifyContract.ts checks the real answer
 * against the contract: status, then every field of the body.
 *
 * Every built operation needs at least one case. Cases run in order against one server and one
 * store, so a case can use what an earlier one created: `capture` saves a field of the answer, and
 * `{{name}}` puts it into a later request. A write is only believed once it is re-fetched: `then`
 * sends a GET afterwards, to show a change took effect or that a rejected write changed nothing.
 */
/**
 * Who a request is sent as. By default, the first way in that the contract lists for the operation
 * (a partner key for the partner endpoints). 'none' sends no credentials; 'wrongKey' sends a key we
 * never issued.
 */
export type Auth = 'partner' | 'none' | 'wrongKey';

export interface VerifyCase {
  /** "METHOD /path" as written in openapi.yaml, e.g. "GET /api/courses/{courseId}". */
  operation: string;
  name: string;
  /** Path and query, e.g. /api/courses?category=catering. May contain {{name}} placeholders. */
  request: string;
  status: number;
  /** Who the request is sent as; see Auth. */
  as?: Auth;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent exactly as written, for a body that is not valid JSON. */
  rawBody?: string;
  /** Save fields of the answer for later cases: { bookingId: 'id' } makes {{bookingId}}. */
  capture?: Record<string, string>;
  /** Fields the answer must have, with exactly these values (other fields are checked against the contract). */
  fields?: Record<string, unknown>;
  /** Response headers that must match. */
  headers?: Record<string, RegExp>;
  /** The number of bookings must be the same after this request: a rejected POST created nothing. */
  noNewBooking?: boolean;
  /** A GET sent afterwards, checked like any other case. */
  then?: {
    operation: string;
    request: string;
    status: number;
    as?: Auth;
    fields?: Record<string, unknown>;
    /** The follow-up's body must equal this case's answer exactly. */
    sameAsAnswer?: boolean;
  };
}

/** A UTC date-time this many days from now, in the API's format. Fixed for the whole run. */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

const START = inDays(30);
const CHANGED_START = inDays(31);
const POST = 'POST /api/bookings';
const PUT = 'PUT /api/bookings/{bookingId}';
const DELETE = 'DELETE /api/bookings/{bookingId}';
const GET_BOOKING = 'GET /api/bookings/{bookingId}';
const booking = { courseId: 'crs_501', crewSize: 6, preferredStart: START, eventName: 'Verify wedding' };
const change = { crewSize: 8, preferredStart: CHANGED_START };
const created = { courseId: 'crs_501', eventName: 'Verify wedding', status: 'pending' };

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

  // ---- Writes. They follow the GETs and use the bookings those leave alone (6001 pending, 6002 confirmed).
  { operation: POST, name: 'creates a pending booking', request: '/api/bookings', status: 201, body: booking,
    headers: { location: /^\/api\/bookings\/bkg_\d+$/ }, fields: { ...created, crewSize: 6, preferredStart: START },
    capture: { bookingId: 'id' }, then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, sameAsAnswer: true } },
  { operation: POST, name: 'the same event again: 409, nothing created', request: '/api/bookings', status: 409, body: booking, noNewBooking: true },
  { operation: POST, name: 'the same event in another case: 409', request: '/api/bookings', status: 409, body: { ...booking, eventName: 'VERIFY WEDDING' }, noNewBooking: true },
  { operation: POST, name: 'unknown course: 404, nothing created', request: '/api/bookings', status: 404, body: { ...booking, courseId: 'crs_999' }, noNewBooking: true },
  { operation: POST, name: 'empty body object', request: '/api/bookings', status: 400, body: {}, noNewBooking: true },
  { operation: POST, name: 'unknown field', request: '/api/bookings', status: 400, body: { ...booking, colour: 'green' }, noNewBooking: true },
  { operation: POST, name: 'crewSize 0', request: '/api/bookings', status: 400, body: { ...booking, crewSize: 0 }, noNewBooking: true },
  { operation: POST, name: 'crewSize 41', request: '/api/bookings', status: 400, body: { ...booking, crewSize: 41 }, noNewBooking: true },
  { operation: POST, name: 'crewSize 2.5', request: '/api/bookings', status: 400, body: { ...booking, crewSize: 2.5 }, noNewBooking: true },
  { operation: POST, name: 'crewSize as text', request: '/api/bookings', status: 400, body: { ...booking, crewSize: '6' }, noNewBooking: true },
  { operation: POST, name: 'start in the past', request: '/api/bookings', status: 400, body: { ...booking, preferredStart: '2020-01-01T08:00:00Z' }, noNewBooking: true },
  { operation: POST, name: 'start on 30 February', request: '/api/bookings', status: 400, body: { ...booking, preferredStart: '2031-02-30T08:00:00Z' }, noNewBooking: true },
  { operation: POST, name: 'empty event name', request: '/api/bookings', status: 400, body: { ...booking, eventName: '  ' }, noNewBooking: true },
  { operation: POST, name: 'event name of 121 characters', request: '/api/bookings', status: 400, body: { ...booking, eventName: 'x'.repeat(121) }, noNewBooking: true },
  { operation: POST, name: 'body is a list', request: '/api/bookings', status: 400, body: [], noNewBooking: true },
  { operation: POST, name: 'body is not valid JSON', request: '/api/bookings', status: 400, rawBody: '{"courseId":', noNewBooking: true },
  { operation: POST, name: 'body over 20 KB: 413, nothing created', request: '/api/bookings', status: 413, body: { ...booking, eventName: 'x'.repeat(21_000) }, noNewBooking: true },

  { operation: PUT, name: 'changes crew size and start date', request: '/api/bookings/{{bookingId}}', status: 200, body: change,
    fields: { ...created, crewSize: 8, preferredStart: CHANGED_START },
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, sameAsAnswer: true } },
  { operation: PUT, name: 'the same body again: same booking (idempotent)', request: '/api/bookings/{{bookingId}}', status: 200, body: change,
    fields: { ...created, crewSize: 8, preferredStart: CHANGED_START },
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, sameAsAnswer: true } },
  { operation: PUT, name: 'crewSize 0: 400, unchanged', request: '/api/bookings/{{bookingId}}', status: 400, body: { ...change, crewSize: 0 },
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, fields: { crewSize: 8, preferredStart: CHANGED_START } } },
  { operation: PUT, name: 'start in the past: 400, unchanged', request: '/api/bookings/{{bookingId}}', status: 400, body: { ...change, preferredStart: '2020-01-01T08:00:00Z' },
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, fields: { crewSize: 8, preferredStart: CHANGED_START } } },
  { operation: PUT, name: 'preferredStart missing: 400, unchanged', request: '/api/bookings/{{bookingId}}', status: 400, body: { crewSize: 3 },
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, fields: { crewSize: 8, preferredStart: CHANGED_START } } },
  { operation: PUT, name: 'tries to rename the event: 400, unchanged', request: '/api/bookings/{{bookingId}}', status: 400, body: { ...change, eventName: 'Other' },
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, fields: { eventName: 'Verify wedding', crewSize: 8 } } },
  { operation: PUT, name: 'body over 20 KB: 413, unchanged', request: '/api/bookings/{{bookingId}}', status: 413, body: { ...change, padding: 'x'.repeat(21_000) },
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 200, fields: { crewSize: 8, preferredStart: CHANGED_START } } },
  { operation: PUT, name: 'unknown booking', request: '/api/bookings/bkg_9999', status: 404, body: change },
  { operation: PUT, name: 'confirmed booking: 409, unchanged', request: '/api/bookings/bkg_6002', status: 409, body: change,
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6002', status: 200, fields: { status: 'confirmed', crewSize: 10, preferredStart: '2026-12-12T08:00:00Z' } } },

  { operation: DELETE, name: 'confirmed booking: 409, still there', request: '/api/bookings/bkg_6002', status: 409,
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6002', status: 200, fields: { status: 'confirmed' } } },
  { operation: DELETE, name: 'unknown booking', request: '/api/bookings/bkg_9999', status: 404 },
  { operation: DELETE, name: 'cancels a pending booking: 204, then it is gone', request: '/api/bookings/{{bookingId}}', status: 204,
    then: { operation: GET_BOOKING, request: '/api/bookings/{{bookingId}}', status: 404 } },
  { operation: DELETE, name: 'cancelling it again: 404', request: '/api/bookings/{{bookingId}}', status: 404 },

  // ---- Partner keys (R4). A refused request must change nothing, so each write is followed by a re-fetch.
  { operation: 'GET /api/courses', name: 'no key: 401', request: '/api/courses', status: 401, as: 'none' },
  { operation: 'GET /api/courses', name: 'a key we never issued: 401', request: '/api/courses', status: 401, as: 'wrongKey' },
  { operation: 'GET /api/courses/{courseId}', name: 'no key: 401', request: '/api/courses/crs_501', status: 401, as: 'none' },
  { operation: 'GET /api/certificates/{certificateNo}', name: 'no key: 401', request: '/api/certificates/UJZ-2026-00123', status: 401, as: 'none' },
  { operation: GET_BOOKING, name: 'no key: 401', request: '/api/bookings/bkg_6001', status: 401, as: 'none' },
  { operation: POST, name: 'no key: 401, nothing created', request: '/api/bookings', status: 401, as: 'none', body: booking, noNewBooking: true },
  { operation: POST, name: 'a key we never issued: 401, nothing created', request: '/api/bookings', status: 401, as: 'wrongKey', body: booking, noNewBooking: true },
  { operation: POST, name: 'no key and a body that is not JSON: 401, not 400', request: '/api/bookings', status: 401, as: 'none', rawBody: '{"courseId":', noNewBooking: true },
  { operation: PUT, name: 'no key: 401, unchanged', request: '/api/bookings/bkg_6001', status: 401, as: 'none', body: change,
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6001', status: 200, fields: { status: 'pending', crewSize: 6, preferredStart: '2026-11-28T08:00:00Z' } } },
  { operation: DELETE, name: 'no key: 401, still there', request: '/api/bookings/bkg_6001', status: 401, as: 'none',
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6001', status: 200, fields: { status: 'pending' } } },
];
