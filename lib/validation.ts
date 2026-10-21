import {
  CATEGORIES,
  CERTIFICATE_NO_PATTERN,
  type BookingChange,
  type Category,
  type CertificateLevel,
  type CourseFilter,
  type NewBooking,
  type NewCourse,
  type Role,
  CERTIFICATE_LEVELS,
} from '@/lib/db/types';

export type Valid<T> = { ok: true; value: T } | { ok: false; message: string };

// Kenya's 47 counties, title case, spelled the way the Constitution does. Shared with Kazi
// Connect and Sherehe: if one system spells a name differently, filters will not line up (R5).
export const KENYA_COUNTIES: readonly string[] = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay', 'Isiolo',
  'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale',
  'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa',
  "Murang'a", 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya',
  'Taita-Taveta', 'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga',
  'Wajir', 'West Pokot',
];

/** The county's official spelling for any capitalisation of its name, or undefined. */
export function findCounty(input: string): string | undefined {
  const wanted = input.trim().toLowerCase();
  return KENYA_COUNTIES.find((county) => county.toLowerCase() === wanted);
}

function single(params: URLSearchParams, name: string): Valid<string | undefined> {
  const values = params.getAll(name);
  if (values.length > 1) return { ok: false, message: `${name} may only be given once` };
  return { ok: true, value: values[0] };
}

/** ?category= and ?county= for GET /api/courses. Absent means "any"; empty or unknown means 400. */
export function parseCourseFilter(params: URLSearchParams): Valid<CourseFilter> {
  const filter: CourseFilter = {};

  const category = single(params, 'category');
  if (!category.ok) return category;
  if (category.value !== undefined) {
    if (!CATEGORIES.includes(category.value as Category)) {
      return { ok: false, message: `category must be one of ${CATEGORIES.join(', ')}` };
    }
    filter.category = category.value as Category;
  }

  const county = single(params, 'county');
  if (!county.ok) return county;
  if (county.value !== undefined) {
    const official = findCounty(county.value);
    if (!official) {
      return { ok: false, message: "county must be one of Kenya's 47 counties, for example Nairobi" };
    }
    filter.county = official;
  }

  return { ok: true, value: filter };
}

export function parseCertificateNo(input: string): Valid<string> {
  if (!CERTIFICATE_NO_PATTERN.test(input)) {
    return { ok: false, message: 'certificateNo must look like UJZ-2026-00123' };
  }
  return { ok: true, value: input };
}

// ---- Request bodies -----------------------------------------------------------------------------

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

/**
 * An RFC 3339 date-time with a Z or an offset ("2026-11-28T08:00:00Z", "2026-11-28T11:00:00+03:00"),
 * as a Date rounded down to the second. Anything else is undefined: a date alone, a time with no
 * zone, or a day that does not exist. (Date.parse alone turns 30 February into 2 March.)
 */
export function parseDateTime(input: string): Date | undefined {
  const m = DATE_TIME.exec(input);
  if (!m) return undefined;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const offsetHour = m[7] === undefined ? 0 : Number(m[7]);
  const offsetMinute = m[8] === undefined ? 0 : Number(m[8]);
  if (year < 1000 || month < 1 || month > 12) return undefined;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return undefined;
  if (offsetHour > 23 || offsetMinute > 59) return undefined;
  const time = Date.parse(input);
  return Number.isNaN(time) ? undefined : new Date(Math.floor(time / 1000) * 1000);
}

const BOOKING_FIELDS = ['courseId', 'crewSize', 'preferredStart', 'eventName'] as const;
const CHANGE_FIELDS = ['crewSize', 'preferredStart'] as const;

/** The body is a JSON object with exactly the allowed fields, all of the required ones present. */
function objectWithFields(
  body: unknown,
  allowed: readonly string[],
  required: readonly string[],
): Valid<Record<string, unknown>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) return { ok: false, message: `Unknown field(s): ${unknown.join(', ')}` };
  const missing = required.filter((key) => record[key] === undefined);
  if (missing.length > 0) return { ok: false, message: `Missing required field(s): ${missing.join(', ')}` };
  return { ok: true, value: record };
}

function crewSize(value: unknown): Valid<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 40) {
    return { ok: false, message: 'crewSize must be a whole number from 1 to 40' };
  }
  return { ok: true, value };
}

function futureDateTime(name: string, value: unknown, now: number): Valid<Date> {
  const date = typeof value === 'string' ? parseDateTime(value) : undefined;
  if (!date || date.getTime() <= now) {
    return { ok: false, message: `${name} must be a future date-time, for example 2026-11-28T08:00:00Z` };
  }
  return { ok: true, value: date };
}

/** POST /api/bookings: courseId, crewSize, preferredStart, eventName, and nothing else. */
export function parseNewBooking(body: unknown, now = Date.now()): Valid<NewBooking> {
  const fields = objectWithFields(body, BOOKING_FIELDS, BOOKING_FIELDS);
  if (!fields.ok) return fields;
  const { courseId, eventName } = fields.value;

  if (typeof courseId !== 'string' || courseId.trim() === '' || courseId.length > 64) {
    return { ok: false, message: 'courseId must be a text id of up to 64 characters, for example crs_501' };
  }
  const size = crewSize(fields.value.crewSize);
  if (!size.ok) return size;
  const start = futureDateTime('preferredStart', fields.value.preferredStart, now);
  if (!start.ok) return start;
  const name = typeof eventName === 'string' ? eventName.trim() : '';
  if (name.length < 1 || name.length > 120) {
    return { ok: false, message: 'eventName must be 1 to 120 characters' };
  }

  return { ok: true, value: { course_id: courseId, crew_size: size.value, preferred_start: start.value, event_name: name } };
}

/** PUT /api/bookings/{id}: crewSize and preferredStart, and nothing else. */
export function parseBookingChange(body: unknown, now = Date.now()): Valid<BookingChange> {
  const fields = objectWithFields(body, CHANGE_FIELDS, CHANGE_FIELDS);
  if (!fields.ok) return fields;
  const size = crewSize(fields.value.crewSize);
  if (!size.ok) return size;
  const start = futureDateTime('preferredStart', fields.value.preferredStart, now);
  if (!start.ok) return start;
  return { ok: true, value: { crew_size: size.value, preferred_start: start.value } };
}

// ---- Accounts, courses, certificates -------------------------------------------------------------

/** A trimmed text field of min to max characters. */
function text(name: string, value: unknown, min: number, max: number): Valid<string> {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length < min || trimmed.length > max) {
    return { ok: false, message: `${name} must be ${min} to ${max} characters` };
  }
  return { ok: true, value: trimmed };
}

/** A text id such as crs_501: not empty, at most 64 characters. */
function idField(name: string, example: string, value: unknown): Valid<string> {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 64) {
    return { ok: false, message: `${name} must be a text id of up to 64 characters, for example ${example}` };
  }
  return { ok: true, value };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function email(value: unknown): Valid<string> {
  const address = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (address.length > 254 || !EMAIL.test(address)) return { ok: false, message: 'email must be an email address, for example achieng@example.com' };
  return { ok: true, value: address };
}

export interface NewUserInput {
  role: Role;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Staff only. */
  centreId?: string;
  inviteCode?: string;
}

const USER_FIELDS = ['role', 'email', 'password', 'firstName', 'lastName', 'centreId', 'inviteCode'] as const;

/** POST /api/auth/register. A graduate sends no centreId or inviteCode; a staff member must send both. */
export function parseNewUser(body: unknown): Valid<NewUserInput> {
  const fields = objectWithFields(body, USER_FIELDS, ['role', 'email', 'password', 'firstName', 'lastName']);
  if (!fields.ok) return fields;
  const { role, password } = fields.value;

  if (role !== 'graduate' && role !== 'staff') return { ok: false, message: 'role must be graduate or staff' };
  const address = email(fields.value.email);
  if (!address.ok) return address;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return { ok: false, message: 'password must be 8 to 128 characters' };
  }
  const firstName = text('firstName', fields.value.firstName, 1, 60);
  if (!firstName.ok) return firstName;
  const lastName = text('lastName', fields.value.lastName, 1, 60);
  if (!lastName.ok) return lastName;

  const user: NewUserInput = { role, email: address.value, password, firstName: firstName.value, lastName: lastName.value };
  if (role === 'graduate') {
    if (fields.value.centreId !== undefined || fields.value.inviteCode !== undefined) {
      return { ok: false, message: 'centreId and inviteCode are only for staff accounts' };
    }
    return { ok: true, value: user };
  }
  const missing = ['centreId', 'inviteCode'].filter((name) => fields.value[name] === undefined);
  if (missing.length > 0) return { ok: false, message: `Missing required field(s): ${missing.join(', ')}` };
  const centreId = idField('centreId', 'cen_11', fields.value.centreId);
  if (!centreId.ok) return centreId;
  const inviteCode = text('inviteCode', fields.value.inviteCode, 1, 200);
  if (!inviteCode.ok) return inviteCode;
  return { ok: true, value: { ...user, centreId: centreId.value, inviteCode: inviteCode.value } };
}

/** POST /api/auth/login. */
export function parseCredentials(body: unknown): Valid<{ email: string; password: string }> {
  const fields = objectWithFields(body, ['email', 'password'], ['email', 'password']);
  if (!fields.ok) return fields;
  const address = email(fields.value.email);
  if (!address.ok) return address;
  const { password } = fields.value;
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
    return { ok: false, message: 'password must be 1 to 128 characters' };
  }
  return { ok: true, value: { email: address.value, password } };
}

/** POST /api/enrolments. */
export function parseNewEnrolment(body: unknown): Valid<{ courseId: string }> {
  const fields = objectWithFields(body, ['courseId'], ['courseId']);
  if (!fields.ok) return fields;
  const courseId = idField('courseId', 'crs_501', fields.value.courseId);
  return courseId.ok ? { ok: true, value: { courseId: courseId.value } } : courseId;
}

/** POST /api/certificates. */
export function parseNewCertificate(body: unknown): Valid<{ enrolmentId: string }> {
  const fields = objectWithFields(body, ['enrolmentId'], ['enrolmentId']);
  if (!fields.ok) return fields;
  const enrolmentId = idField('enrolmentId', 'enr_0001', fields.value.enrolmentId);
  return enrolmentId.ok ? { ok: true, value: { enrolmentId: enrolmentId.value } } : enrolmentId;
}

/** PATCH /api/bookings/{id}: the staff decision. */
export function parseBookingDecision(body: unknown): Valid<'confirmed' | 'declined'> {
  const fields = objectWithFields(body, ['status'], ['status']);
  if (!fields.ok) return fields;
  const { status } = fields.value;
  if (status !== 'confirmed' && status !== 'declined') return { ok: false, message: 'status must be confirmed or declined' };
  return { ok: true, value: status };
}

const COURSE_FIELDS = ['title', 'category', 'durationWeeks', 'feeKes', 'nextStart', 'certificateLevel'] as const;

/** POST /api/courses and PUT /api/courses/{id}: every detail of a course except its centre. */
export function parseCourseDetails(body: unknown, now = Date.now()): Valid<Omit<NewCourse, 'centre_id'>> {
  const fields = objectWithFields(body, COURSE_FIELDS, COURSE_FIELDS);
  if (!fields.ok) return fields;
  const { category, durationWeeks, feeKes, certificateLevel } = fields.value;

  const title = text('title', fields.value.title, 1, 120);
  if (!title.ok) return title;
  if (!CATEGORIES.includes(category as Category)) {
    return { ok: false, message: `category must be one of ${CATEGORIES.join(', ')}` };
  }
  if (typeof durationWeeks !== 'number' || !Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 104) {
    return { ok: false, message: 'durationWeeks must be a whole number from 1 to 104' };
  }
  if (typeof feeKes !== 'number' || !Number.isInteger(feeKes) || feeKes < 0 || feeKes > 1_000_000) {
    return { ok: false, message: 'feeKes must be a whole number of shillings from 0 to 1000000' };
  }
  const start = futureDateTime('nextStart', fields.value.nextStart, now);
  if (!start.ok) return start;
  if (!CERTIFICATE_LEVELS.includes(certificateLevel as CertificateLevel)) {
    return { ok: false, message: `certificateLevel must be one of ${CERTIFICATE_LEVELS.join(', ')}` };
  }

  return {
    ok: true,
    value: {
      title: title.value,
      category: category as Category,
      duration_weeks: durationWeeks,
      fee_kes: feeKes,
      next_start: start.value,
      certificate_level: certificateLevel as CertificateLevel,
    },
  };
}
