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
 * Who a request is sent as. By default, the first way in that the contract lists for the operation:
 * a partner key for the partner endpoints, a logged in graduate for the website's, a logged in staff
 * member where the contract says staff. Otherwise:
 *   'none' sends no credentials; 'wrongKey' a partner key we never issued; 'badToken' a login token
 *   that was never issued; a seeded person ('achieng', 'mwanaisha' are graduates, 'westlands',
 *   'hurlingham', 'ruaka' staff at those centres) logs in as them; 'logoutSession' is a login of its own,
 *   so the case that logs it out does not break the others; { bearer: 'name' } sends a token that an
 *   earlier case captured.
 */
export type Auth =
  | 'partner' | 'none' | 'wrongKey' | 'badToken'
  | 'achieng' | 'mwanaisha' | 'westlands' | 'hurlingham' | 'ruaka' | 'logoutSession'
  | { bearer: string };

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
  /** The answer is a list, and one item of it has these fields. */
  includes?: Record<string, unknown>;
  /** Kazi Connect is stopped for this one request (containment: our own 502, nothing changed). */
  kaziDown?: boolean;
  /** Response headers that must match. */
  headers?: Record<string, RegExp>;
  /** The number of bookings must be the same after this request: a rejected POST created nothing. */
  noNewBooking?: boolean;
  /** No account may exist for this email afterwards: a rejected sign-up created nothing. */
  noUserWithEmail?: string;
  /** A GET sent afterwards, checked like any other case. */
  then?: {
    operation: string;
    request: string;
    status: number;
    as?: Auth;
    fields?: Record<string, unknown>;
    /** The follow-up's body must equal this case's answer exactly. */
    sameAsAnswer?: boolean;
    /** The follow-up's body is a list, and one item of it has these fields. */
    includes?: Record<string, unknown>;
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

  // ---- The website: accounts. Password and token never come back, and a refused sign-up creates nothing.
  { operation: 'POST /api/auth/register', name: 'creates a graduate account and logs it in', request: '/api/auth/register', status: 201, as: 'none',
    body: { role: 'graduate', email: 'verify.person@example.com', password: 'a long passphrase', firstName: 'Verify', lastName: 'Person' },
    capture: { newToken: 'token' },
    then: { operation: 'GET /api/me', request: '/api/me', status: 200, as: { bearer: 'newToken' }, fields: { id: 'grd_0104', role: 'graduate', email: 'verify.person@example.com', centreId: null } } },
  { operation: 'POST /api/auth/register', name: 'the same email again, in another case: 409', request: '/api/auth/register', status: 409, as: 'none',
    body: { role: 'graduate', email: 'VERIFY.PERSON@example.com', password: 'a long passphrase', firstName: 'Verify', lastName: 'Person' } },
  { operation: 'POST /api/auth/register', name: 'staff sign-up with no invite code configured: 403, nothing created', request: '/api/auth/register', status: 403, as: 'none', noUserWithEmail: 'verify.staff@example.com',
    body: { role: 'staff', email: 'verify.staff@example.com', password: 'a long passphrase', firstName: 'Verify', lastName: 'Staff', centreId: 'cen_11', inviteCode: 'anything' } },
  { operation: 'POST /api/auth/register', name: 'no fields: 400', request: '/api/auth/register', status: 400, as: 'none', body: {} },
  { operation: 'POST /api/auth/register', name: 'password of 7 characters: 400, nothing created', request: '/api/auth/register', status: 400, as: 'none', noUserWithEmail: 'short.password@example.com',
    body: { role: 'graduate', email: 'short.password@example.com', password: '1234567', firstName: 'Short', lastName: 'Password' } },
  { operation: 'POST /api/auth/register', name: 'unknown role: 400', request: '/api/auth/register', status: 400, as: 'none', noUserWithEmail: 'admin.person@example.com',
    body: { role: 'admin', email: 'admin.person@example.com', password: 'a long passphrase', firstName: 'Admin', lastName: 'Person' } },
  { operation: 'POST /api/auth/register', name: 'a graduate with a centreId: 400, nothing created', request: '/api/auth/register', status: 400, as: 'none', noUserWithEmail: 'centre.grad@example.com',
    body: { role: 'graduate', email: 'centre.grad@example.com', password: 'a long passphrase', firstName: 'Centre', lastName: 'Grad', centreId: 'cen_11' } },
  { operation: 'POST /api/auth/register', name: 'body over 20 KB: 413', request: '/api/auth/register', status: 413, as: 'none',
    body: { role: 'graduate', email: 'big.person@example.com', password: 'a long passphrase', firstName: 'x'.repeat(21_000), lastName: 'Person' }, noUserWithEmail: 'big.person@example.com' },

  { operation: 'POST /api/auth/login', name: 'the seeded demo password', request: '/api/auth/login', status: 200, as: 'none',
    body: { email: 'achieng.otieno@example.com', password: 'ujuzi-demo-pass' }, capture: { loginToken: 'token' },
    then: { operation: 'GET /api/me', request: '/api/me', status: 200, as: { bearer: 'loginToken' }, fields: { id: 'grd_0101', role: 'graduate' } } },
  { operation: 'POST /api/auth/login', name: 'a wrong password: 401', request: '/api/auth/login', status: 401, as: 'none', body: { email: 'achieng.otieno@example.com', password: 'wrong' } },
  { operation: 'POST /api/auth/login', name: 'an email with no account: 401', request: '/api/auth/login', status: 401, as: 'none', body: { email: 'nobody@example.com', password: 'ujuzi-demo-pass' } },
  { operation: 'POST /api/auth/login', name: 'no fields: 400', request: '/api/auth/login', status: 400, as: 'none', body: {} },
  { operation: 'POST /api/auth/login', name: 'body is not valid JSON: 400', request: '/api/auth/login', status: 400, as: 'none', rawBody: '{"email":' },
  { operation: 'POST /api/auth/login', name: 'body over 20 KB: 413', request: '/api/auth/login', status: 413, as: 'none', body: { email: 'achieng.otieno@example.com', password: 'x', padding: 'x'.repeat(21_000) } },

  { operation: 'GET /api/me', name: 'a graduate', request: '/api/me', status: 200, fields: { id: 'grd_0101', role: 'graduate', centreId: null } },
  { operation: 'GET /api/me', name: 'a staff member', request: '/api/me', status: 200, as: 'westlands', fields: { id: 'usr_0001', role: 'staff', centreId: 'cen_11' } },
  { operation: 'GET /api/me', name: 'no token: 401', request: '/api/me', status: 401, as: 'none' },
  { operation: 'GET /api/me', name: 'a token we never issued: 401', request: '/api/me', status: 401, as: 'badToken' },

  { operation: 'POST /api/auth/logout', name: 'logs out: 204, and the token stops working', request: '/api/auth/logout', status: 204, as: 'logoutSession',
    then: { operation: 'GET /api/me', request: '/api/me', status: 401, as: 'logoutSession' } },
  { operation: 'POST /api/auth/logout', name: 'no token: 401', request: '/api/auth/logout', status: 401, as: 'none' },

  // ---- The course and certificate reads also accept a login token.
  { operation: 'GET /api/courses', name: 'a login token instead of a key', request: '/api/courses', status: 200, as: 'achieng' },
  { operation: 'GET /api/courses', name: 'a token we never issued: 401', request: '/api/courses', status: 401, as: 'badToken' },
  { operation: 'GET /api/courses/{courseId}', name: 'a login token instead of a key', request: '/api/courses/crs_501', status: 200, as: 'achieng' },
  { operation: 'GET /api/certificates/{certificateNo}', name: 'a login token instead of a key', request: '/api/certificates/UJZ-2026-00123', status: 200, as: 'achieng' },

  // ---- Enrolments
  { operation: 'POST /api/enrolments', name: 'enrols a graduate: 201, and it is in their list', request: '/api/enrolments', status: 201, as: 'mwanaisha', body: { courseId: 'crs_503' },
    fields: { id: 'enr_0004', courseId: 'crs_503', courseTitle: 'Basic plumbing and pipe fitting', certificateNo: null },
    then: { operation: 'GET /api/me/enrolments', request: '/api/me/enrolments', status: 200, as: 'mwanaisha', includes: { id: 'enr_0004', courseId: 'crs_503' } } },
  { operation: 'POST /api/enrolments', name: 'enrolling again: 409', request: '/api/enrolments', status: 409, as: 'mwanaisha', body: { courseId: 'crs_503' } },
  { operation: 'POST /api/enrolments', name: 'unknown course: 404', request: '/api/enrolments', status: 404, as: 'mwanaisha', body: { courseId: 'crs_999' } },
  { operation: 'POST /api/enrolments', name: 'no courseId: 400', request: '/api/enrolments', status: 400, as: 'mwanaisha', body: {} },
  { operation: 'POST /api/enrolments', name: 'a staff member cannot enrol: 403', request: '/api/enrolments', status: 403, as: 'westlands', body: { courseId: 'crs_501' } },
  { operation: 'POST /api/enrolments', name: 'no token: 401', request: '/api/enrolments', status: 401, as: 'none', body: { courseId: 'crs_501' } },
  { operation: 'POST /api/enrolments', name: 'body over 20 KB: 413', request: '/api/enrolments', status: 413, as: 'mwanaisha', body: { courseId: 'x'.repeat(21_000) } },
  { operation: 'GET /api/me/enrolments', name: 'a graduate with a certificate', request: '/api/me/enrolments', status: 200, then: { operation: 'GET /api/me', request: '/api/me', status: 200 } },
  { operation: 'GET /api/me/enrolments', name: 'a staff member has none to list: 403', request: '/api/me/enrolments', status: 403, as: 'westlands' },
  { operation: 'GET /api/me/enrolments', name: 'no token: 401', request: '/api/me/enrolments', status: 401, as: 'none' },

  // ---- Staff: courses
  { operation: 'POST /api/courses', name: 'creates a course at the staff member\'s centre', request: '/api/courses', status: 201, as: 'westlands',
    body: { title: 'Verify barista basics', category: 'catering', durationWeeks: 3, feeKes: 4200, nextStart: inDays(40), certificateLevel: 'short-course' },
    headers: { location: /^\/api\/courses\/crs_\d+$/ }, fields: { id: 'crs_510', title: 'Verify barista basics', county: 'Nairobi', area: 'Westlands' },
    capture: { newCourse: 'id' }, then: { operation: 'GET /api/courses/{courseId}', request: '/api/courses/{{newCourse}}', status: 200, as: 'partner', sameAsAnswer: true } },
  { operation: 'POST /api/courses', name: 'tries to choose the centre: 400', request: '/api/courses', status: 400, as: 'westlands',
    body: { title: 'Other centre', category: 'catering', durationWeeks: 3, feeKes: 4200, nextStart: inDays(40), certificateLevel: 'short-course', centreId: 'cen_12' } },
  { operation: 'POST /api/courses', name: 'an unknown category: 400', request: '/api/courses', status: 400, as: 'westlands',
    body: { title: 'Bad', category: 'cooking', durationWeeks: 3, feeKes: 4200, nextStart: inDays(40), certificateLevel: 'short-course' } },
  { operation: 'POST /api/courses', name: 'a start in the past: 400', request: '/api/courses', status: 400, as: 'westlands',
    body: { title: 'Bad', category: 'catering', durationWeeks: 3, feeKes: 4200, nextStart: '2020-01-01T07:00:00Z', certificateLevel: 'short-course' } },
  { operation: 'POST /api/courses', name: 'no fields: 400', request: '/api/courses', status: 400, as: 'westlands', body: {} },
  { operation: 'POST /api/courses', name: 'a graduate cannot: 403', request: '/api/courses', status: 403, as: 'achieng',
    body: { title: 'Nope', category: 'catering', durationWeeks: 3, feeKes: 4200, nextStart: inDays(40), certificateLevel: 'short-course' } },
  { operation: 'POST /api/courses', name: 'no token: 401', request: '/api/courses', status: 401, as: 'none', body: {} },
  { operation: 'POST /api/courses', name: 'body over 20 KB: 413', request: '/api/courses', status: 413, as: 'westlands', body: { title: 'x'.repeat(21_000) } },

  { operation: 'PUT /api/courses/{courseId}', name: 'replaces the details of its own centre\'s course', request: '/api/courses/{{newCourse}}', status: 200, as: 'westlands',
    body: { title: 'Verify barista advanced', category: 'events', durationWeeks: 4, feeKes: 5000, nextStart: inDays(41), certificateLevel: 'grade-III' },
    fields: { id: 'crs_510', title: 'Verify barista advanced', category: 'events', feeKes: 5000, certificateLevel: 'grade-III' },
    then: { operation: 'GET /api/courses/{courseId}', request: '/api/courses/{{newCourse}}', status: 200, as: 'partner', sameAsAnswer: true } },
  { operation: 'PUT /api/courses/{courseId}', name: 'the same body again: same course (idempotent)', request: '/api/courses/{{newCourse}}', status: 200, as: 'westlands',
    body: { title: 'Verify barista advanced', category: 'events', durationWeeks: 4, feeKes: 5000, nextStart: inDays(41), certificateLevel: 'grade-III' },
    then: { operation: 'GET /api/courses/{courseId}', request: '/api/courses/{{newCourse}}', status: 200, as: 'partner', sameAsAnswer: true } },
  { operation: 'PUT /api/courses/{courseId}', name: 'another centre\'s staff: 403, unchanged', request: '/api/courses/{{newCourse}}', status: 403, as: 'hurlingham',
    body: { title: 'Hijacked', category: 'events', durationWeeks: 4, feeKes: 5000, nextStart: inDays(41), certificateLevel: 'grade-III' },
    then: { operation: 'GET /api/courses/{courseId}', request: '/api/courses/{{newCourse}}', status: 200, as: 'partner', fields: { title: 'Verify barista advanced' } } },
  { operation: 'PUT /api/courses/{courseId}', name: 'an invalid body: 400, unchanged', request: '/api/courses/{{newCourse}}', status: 400, as: 'westlands',
    body: { title: 'Bad', category: 'events', durationWeeks: 0, feeKes: 5000, nextStart: inDays(41), certificateLevel: 'grade-III' },
    then: { operation: 'GET /api/courses/{courseId}', request: '/api/courses/{{newCourse}}', status: 200, as: 'partner', fields: { title: 'Verify barista advanced', durationWeeks: 4 } } },
  { operation: 'PUT /api/courses/{courseId}', name: 'unknown course: 404', request: '/api/courses/crs_999', status: 404, as: 'westlands',
    body: { title: 'Nope', category: 'events', durationWeeks: 4, feeKes: 5000, nextStart: inDays(41), certificateLevel: 'grade-III' } },
  { operation: 'PUT /api/courses/{courseId}', name: 'a graduate cannot: 403', request: '/api/courses/crs_501', status: 403, as: 'achieng', body: {} },
  { operation: 'PUT /api/courses/{courseId}', name: 'no token: 401', request: '/api/courses/crs_501', status: 401, as: 'none', body: {} },

  // ---- Staff: certificates
  { operation: 'POST /api/certificates', name: 'another centre\'s staff: 403, nothing issued', request: '/api/certificates', status: 403, as: 'westlands', body: { enrolmentId: 'enr_0003' } },
  { operation: 'POST /api/certificates', name: 'issues a certificate for an enrolment at the staff member\'s centre', request: '/api/certificates', status: 201, as: 'ruaka', body: { enrolmentId: 'enr_0003' },
    headers: { location: /^\/api\/certificates\/UJZ-\d{4}-\d{5}$/ }, fields: { valid: true, courseTitle: 'Housekeeping and guest room care', holder: 'Mwanaisha J.' },
    capture: { newCertificate: 'certificateNo' },
    then: { operation: 'GET /api/certificates/{certificateNo}', request: '/api/certificates/{{newCertificate}}', status: 200, as: 'partner', sameAsAnswer: true } },
  { operation: 'POST /api/certificates', name: 'issuing again: 409', request: '/api/certificates', status: 409, as: 'ruaka', body: { enrolmentId: 'enr_0003' } },
  { operation: 'POST /api/certificates', name: 'unknown enrolment: 404', request: '/api/certificates', status: 404, as: 'ruaka', body: { enrolmentId: 'enr_9999' } },
  { operation: 'POST /api/certificates', name: 'no enrolmentId: 400', request: '/api/certificates', status: 400, as: 'ruaka', body: {} },
  { operation: 'POST /api/certificates', name: 'a graduate cannot: 403', request: '/api/certificates', status: 403, as: 'mwanaisha', body: { enrolmentId: 'enr_0003' } },
  { operation: 'POST /api/certificates', name: 'no token: 401', request: '/api/certificates', status: 401, as: 'none', body: { enrolmentId: 'enr_0003' } },
  { operation: 'POST /api/certificates', name: 'body over 20 KB: 413', request: '/api/certificates', status: 413, as: 'ruaka', body: { enrolmentId: 'x'.repeat(21_000) } },

  // ---- Staff: bookings
  { operation: 'GET /api/bookings', name: 'the centre\'s bookings', request: '/api/bookings', status: 200, as: 'westlands',
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6001', status: 200, as: 'partner', fields: { status: 'pending' } } },
  { operation: 'GET /api/bookings', name: 'another centre sees none of them: [] with 200', request: '/api/bookings', status: 200, as: 'hurlingham' },
  { operation: 'GET /api/bookings', name: 'a graduate cannot: 403', request: '/api/bookings', status: 403, as: 'achieng' },
  { operation: 'GET /api/bookings', name: 'no token: 401', request: '/api/bookings', status: 401, as: 'none' },

  { operation: 'PATCH /api/bookings/{bookingId}', name: 'another centre\'s staff: 403, unchanged', request: '/api/bookings/bkg_6001', status: 403, as: 'hurlingham', body: { status: 'confirmed' },
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6001', status: 200, as: 'partner', fields: { status: 'pending' } } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'an invalid status: 400, unchanged', request: '/api/bookings/bkg_6001', status: 400, as: 'westlands', body: { status: 'maybe' },
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6001', status: 200, as: 'partner', fields: { status: 'pending' } } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'confirms a pending booking', request: '/api/bookings/bkg_6001', status: 200, as: 'westlands', body: { status: 'confirmed' }, fields: { id: 'bkg_6001', status: 'confirmed' },
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6001', status: 200, as: 'partner', sameAsAnswer: true } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'deciding again: 409', request: '/api/bookings/bkg_6001', status: 409, as: 'westlands', body: { status: 'declined' },
    then: { operation: GET_BOOKING, request: '/api/bookings/bkg_6001', status: 200, as: 'partner', fields: { status: 'confirmed' } } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'unknown booking: 404', request: '/api/bookings/bkg_9999', status: 404, as: 'westlands', body: { status: 'confirmed' } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'a graduate cannot: 403', request: '/api/bookings/bkg_6002', status: 403, as: 'achieng', body: { status: 'declined' } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'no token: 401', request: '/api/bookings/bkg_6002', status: 401, as: 'none', body: { status: 'declined' } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'a partner key is not a login: 401', request: '/api/bookings/bkg_6002', status: 401, as: 'partner', body: { status: 'declined' } },
  { operation: 'PATCH /api/bookings/{bookingId}', name: 'body over 20 KB: 413', request: '/api/bookings/bkg_6002', status: 413, as: 'westlands', body: { status: 'declined', padding: 'x'.repeat(21_000) } },

  // ---- Kazi Connect through Ujuzi. verify runs a stub Kazi (the same one the tests use), never the real one.
  { operation: 'GET /api/courses/{courseId}/job-matches', name: 'the active catering jobs in Nairobi', request: '/api/courses/crs_501/job-matches', status: 200, includes: { jobId: 'job_12345', category: 'catering', county: 'Nairobi' } },
  { operation: 'GET /api/courses/{courseId}/job-matches', name: 'another county, in lower case', request: '/api/courses/crs_505/job-matches?county=kiambu', status: 200, includes: { jobId: 'job_12348' } },
  { operation: 'GET /api/courses/{courseId}/job-matches', name: 'nothing matches: [] with 200', request: '/api/courses/crs_509/job-matches', status: 200 },
  { operation: 'GET /api/courses/{courseId}/job-matches', name: 'an unknown county: 400', request: '/api/courses/crs_501/job-matches?county=Narnia', status: 400 },
  { operation: 'GET /api/courses/{courseId}/job-matches', name: 'an unknown course: 404', request: '/api/courses/crs_999/job-matches', status: 404 },
  { operation: 'GET /api/courses/{courseId}/job-matches', name: 'no token: 401', request: '/api/courses/crs_501/job-matches', status: 401, as: 'none' },
  { operation: 'GET /api/courses/{courseId}/job-matches', name: 'Kazi down: our own 502', request: '/api/courses/crs_502/job-matches', status: 502, kaziDown: true },

  { operation: 'POST /api/me/applications', name: 'applies for a job at Kazi: 201, saved, in the list', request: '/api/me/applications', status: 201,
    body: { jobId: 'job_12345', preferredDate: START, note: 'After 2pm' }, headers: { location: /^\/api\/me\/applications\/app_\d+$/ },
    fields: { applicationId: 'app_1005', jobId: 'job_12345', note: 'After 2pm', status: 'pending', preferredDate: START },
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1005', status: 'pending' } } },
  { operation: 'POST /api/me/applications', name: 'a second application, to withdraw later', request: '/api/me/applications', status: 201, body: { jobId: 'job_12346', preferredDate: START }, fields: { applicationId: 'app_1006' } },
  { operation: 'POST /api/me/applications', name: 'a closed job: our own 409', request: '/api/me/applications', status: 409, body: { jobId: 'job_12349', preferredDate: START } },
  { operation: 'POST /api/me/applications', name: 'a job Kazi does not know: our own 400', request: '/api/me/applications', status: 400, body: { jobId: 'job_nope', preferredDate: START } },
  { operation: 'POST /api/me/applications', name: 'no fields: 400', request: '/api/me/applications', status: 400, body: {} },
  { operation: 'POST /api/me/applications', name: 'a date in the past: 400', request: '/api/me/applications', status: 400, body: { jobId: 'job_12345', preferredDate: '2020-01-01T09:00:00Z' } },
  { operation: 'POST /api/me/applications', name: 'the studentId cannot be chosen: 400', request: '/api/me/applications', status: 400, body: { jobId: 'job_12345', preferredDate: START, studentId: 'grd_0999' } },
  { operation: 'POST /api/me/applications', name: 'a staff member cannot apply: 403', request: '/api/me/applications', status: 403, as: 'westlands', body: { jobId: 'job_12345', preferredDate: START } },
  { operation: 'POST /api/me/applications', name: 'no token: 401', request: '/api/me/applications', status: 401, as: 'none', body: { jobId: 'job_12345', preferredDate: START } },
  { operation: 'POST /api/me/applications', name: 'body over 20 KB: 413', request: '/api/me/applications', status: 413, body: { jobId: 'job_12345', preferredDate: START, note: 'x'.repeat(21_000) } },
  { operation: 'POST /api/me/applications', name: 'Kazi down: our own 502', request: '/api/me/applications', status: 502, kaziDown: true, body: { jobId: 'job_12348', preferredDate: START } },

  { operation: 'GET /api/me/applications', name: 'the graduate\'s applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1006', status: 'pending' } },
  { operation: 'GET /api/me/applications', name: 'another graduate has none: [] with 200', request: '/api/me/applications', status: 200, as: 'mwanaisha' },
  { operation: 'GET /api/me/applications', name: 'a staff member cannot: 403', request: '/api/me/applications', status: 403, as: 'westlands' },
  { operation: 'GET /api/me/applications', name: 'no token: 401', request: '/api/me/applications', status: 401, as: 'none' },

  { operation: 'PUT /api/me/applications/{id}', name: 'reschedules a pending application', request: '/api/me/applications/app_1005', status: 200, body: { preferredDate: CHANGED_START },
    fields: { applicationId: 'app_1005', preferredDate: CHANGED_START, note: '' },
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1005', preferredDate: CHANGED_START } } },
  { operation: 'PUT /api/me/applications/{id}', name: 'someone else\'s application: 404, unchanged', request: '/api/me/applications/app_1005', status: 404, as: 'mwanaisha', body: { preferredDate: START },
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1005', preferredDate: CHANGED_START } } },
  { operation: 'PUT /api/me/applications/{id}', name: 'a date in the past: 400, unchanged', request: '/api/me/applications/app_1005', status: 400, body: { preferredDate: '2020-01-01T09:00:00Z' },
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1005', preferredDate: CHANGED_START } } },
  { operation: 'PUT /api/me/applications/{id}', name: 'an unknown application: 404', request: '/api/me/applications/app_9999', status: 404, body: { preferredDate: START } },
  { operation: 'PUT /api/me/applications/{id}', name: 'a staff member cannot: 403', request: '/api/me/applications/app_1005', status: 403, as: 'westlands', body: { preferredDate: START } },
  { operation: 'PUT /api/me/applications/{id}', name: 'no token: 401', request: '/api/me/applications/app_1005', status: 401, as: 'none', body: { preferredDate: START } },
  { operation: 'PUT /api/me/applications/{id}', name: 'Kazi down: our own 502, unchanged', request: '/api/me/applications/app_1005', status: 502, kaziDown: true, body: { preferredDate: START },
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1005', preferredDate: CHANGED_START } } },

  { operation: 'DELETE /api/me/applications/{id}', name: 'someone else\'s application: 404, still there', request: '/api/me/applications/app_1006', status: 404, as: 'mwanaisha',
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1006', status: 'pending' } } },
  { operation: 'DELETE /api/me/applications/{id}', name: 'Kazi down: our own 502, still pending', request: '/api/me/applications/app_1006', status: 502, kaziDown: true,
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1006', status: 'pending' } } },
  { operation: 'DELETE /api/me/applications/{id}', name: 'withdraws a pending application: 204, kept as cancelled', request: '/api/me/applications/app_1006', status: 204,
    then: { operation: 'GET /api/me/applications', request: '/api/me/applications', status: 200, includes: { applicationId: 'app_1006', status: 'cancelled' } } },
  { operation: 'DELETE /api/me/applications/{id}', name: 'withdrawing it again: 409', request: '/api/me/applications/app_1006', status: 409 },
  { operation: 'DELETE /api/me/applications/{id}', name: 'an unknown application: 404', request: '/api/me/applications/app_9999', status: 404 },
  { operation: 'DELETE /api/me/applications/{id}', name: 'a staff member cannot: 403', request: '/api/me/applications/app_1005', status: 403, as: 'westlands' },
  { operation: 'DELETE /api/me/applications/{id}', name: 'no token: 401', request: '/api/me/applications/app_1005', status: 401, as: 'none' },

  { operation: 'GET /api/me/applications/feed', name: 'plain HTTP: 426, it is a WebSocket', request: '/api/me/applications/feed', status: 426, as: 'none' },
];
