import type { components as UjuziContract } from '@/types/api';
import type { components as KaziContract } from '@/types/kazi';

// Enum values come from the generated contract types, so a change to openapi.yaml or to Kazi's
// contract breaks `npm run typecheck` here instead of drifting silently.
export type Category = UjuziContract['schemas']['Course']['category'];
export type CertificateLevel = UjuziContract['schemas']['Course']['certificateLevel'];
export type BookingStatus = UjuziContract['schemas']['Booking']['status'];
export type KaziApplicationStatus = KaziContract['schemas']['ApplicationStatus']['status'];
export type Role = 'graduate' | 'staff';

// The shared lists (identical in all three systems). Mirrored by CHECK constraints in 001_init.sql.
export const CATEGORIES: readonly Category[] = [
  'accommodation', 'campus', 'catering', 'cleaning', 'electrical',
  'events', 'plumbing', 'security', 'tutoring',
];
export const CERTIFICATE_LEVELS: readonly CertificateLevel[] = [
  'short-course', 'grade-III', 'grade-II', 'grade-I',
];

// ---- IDs ----------------------------------------------------------------------------------------
// An id is prefix + (offset + n) zero-padded to `pad` digits, where n is the next value of the
// kind's sequence (1, 2, 3 ...). With these offsets the first rows are cen_11, crs_501, grd_0101,
// usr_0001, enr_0001 and bkg_6001, matching the examples in openapi.yaml. Both stores use this.
export type IdKind = 'centre' | 'course' | 'graduate' | 'staff' | 'enrolment' | 'booking';

export const ID_FORMATS: Record<IdKind, { prefix: string; offset: number; pad: number }> = {
  centre: { prefix: 'cen_', offset: 10, pad: 0 },
  course: { prefix: 'crs_', offset: 500, pad: 0 },
  graduate: { prefix: 'grd_', offset: 100, pad: 4 },
  staff: { prefix: 'usr_', offset: 0, pad: 4 },
  enrolment: { prefix: 'enr_', offset: 0, pad: 4 },
  booking: { prefix: 'bkg_', offset: 6000, pad: 0 },
};

export function formatId(kind: IdKind, n: number): string {
  const { prefix, offset, pad } = ID_FORMATS[kind];
  return prefix + String(offset + n).padStart(pad, '0');
}

/** Certificate numbers look like UJZ-2026-00123: the year issued, then a running number. */
export function formatCertificateNo(year: number, n: number): string {
  return `UJZ-${year}-${String(n).padStart(5, '0')}`;
}

// ---- Row types: snake_case, exactly the columns in 001_init.sql ----------------------------------
// timestamptz columns are Date objects; the `date` column issued_on is a 'YYYY-MM-DD' string.

export interface CentreRow {
  id: string;
  name: string;
  county: string;
  area: string;
}

export interface CourseRow {
  id: string;
  centre_id: string;
  title: string;
  category: Category;
  duration_weeks: number;
  fee_kes: number;
  next_start: Date;
  certificate_level: CertificateLevel;
}

/** A course joined to its centre: the shape the Course contract type is built from. */
export interface CourseDetailRow extends CourseRow {
  centre_name: string;
  county: string;
  area: string;
}

export interface UserRow {
  id: string;
  role: Role;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  centre_id: string | null;
  created_at: Date;
}

export interface SessionRow {
  token_hash: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
}

export interface EnrolmentRow {
  id: string;
  graduate_id: string;
  course_id: string;
  enrolled_at: Date;
}

export interface CertificateRow {
  certificate_no: string;
  enrolment_id: string;
  course_title: string;
  level: CertificateLevel;
  issued_on: string;
  revoked_at: Date | null;
}

/** A certificate joined to its holder; the mapper reduces the name to "Achieng O.". */
export interface CertificateDetailRow extends CertificateRow {
  holder_first_name: string;
  holder_last_name: string;
}

export interface BookingRow {
  id: string;
  course_id: string;
  event_name: string;
  crew_size: number;
  preferred_start: Date;
  status: BookingStatus;
  created_at: Date;
}

export interface KaziApplicationRow {
  application_id: string;
  graduate_id: string;
  job_id: string;
  preferred_date: Date;
  note: string;
  status: KaziApplicationStatus;
  created_at: Date;
  updated_at: Date;
}

// ---- Inputs -------------------------------------------------------------------------------------

export type NewCentre = Omit<CentreRow, 'id'>;
export type NewCourse = Omit<CourseRow, 'id'>;
export type NewUser = Omit<UserRow, 'id' | 'created_at'>;
export type NewSession = Omit<SessionRow, 'created_at'>;
export type NewEnrolment = Pick<EnrolmentRow, 'graduate_id' | 'course_id'>;
/** course_title and level are copied from the course by the caller, at the moment of issue. */
export type NewCertificate = Omit<CertificateRow, 'certificate_no' | 'revoked_at'>;
export type NewBooking = Pick<BookingRow, 'course_id' | 'event_name' | 'crew_size' | 'preferred_start'>;
export type BookingChange = Pick<BookingRow, 'crew_size' | 'preferred_start'>;
export type NewKaziApplication = Pick<
  KaziApplicationRow,
  'application_id' | 'graduate_id' | 'job_id' | 'preferred_date' | 'note' | 'status'
>;
export type KaziApplicationChange = Partial<Pick<KaziApplicationRow, 'preferred_date' | 'note' | 'status'>>;

export interface CourseFilter {
  category?: Category;
  /** Matched ignoring case. */
  county?: string;
}

// ---- Errors -------------------------------------------------------------------------------------

/** A write broke a uniqueness rule: email taken, already enrolled, certificate already issued, ... */
export class StoreConflictError extends Error {}

/** A write pointed at a row that does not exist. Handlers check first, so this means a bug. */
export class StoreReferenceError extends Error {}

/**
 * What happened to a booking that may only be changed while pending. The check and the change are
 * one atomic step, so two callers cannot both modify the same pending booking.
 */
export type BookingOutcome =
  | { kind: 'ok'; booking: BookingRow }
  | { kind: 'not_found' }
  | { kind: 'not_pending'; booking: BookingRow };

// ---- The Store ----------------------------------------------------------------------------------

/**
 * Everything the handlers and realtime code need from storage. lib/db/index.ts hands out the
 * PostgreSQL store when DATABASE_URL is set and the in-memory store otherwise; both must behave
 * identically. Rules every implementation follows:
 *   - get* methods answer undefined when nothing matches; list* methods answer [] and never undefined.
 *   - lists come back in creation order.
 *   - rows returned are copies; changing one never changes what is stored.
 *   - a write that breaks a uniqueness rule throws StoreConflictError; one that points at a missing
 *     row throws StoreReferenceError.
 */
export interface Store {
  // Centres
  createCentre(input: NewCentre): Promise<CentreRow>;
  listCentres(): Promise<CentreRow[]>;
  getCentre(id: string): Promise<CentreRow | undefined>;

  // Courses
  createCourse(input: NewCourse): Promise<CourseDetailRow>;
  updateCourse(id: string, input: NewCourse): Promise<CourseDetailRow | undefined>;
  listCourses(filter?: CourseFilter): Promise<CourseDetailRow[]>;
  getCourse(id: string): Promise<CourseDetailRow | undefined>;

  // Users and login sessions (email is matched ignoring case; a taken email is a StoreConflictError)
  createUser(input: NewUser): Promise<UserRow>;
  getUser(id: string): Promise<UserRow | undefined>;
  getUserByEmail(email: string): Promise<UserRow | undefined>;
  createSession(input: NewSession): Promise<SessionRow>;
  getSession(tokenHash: string): Promise<SessionRow | undefined>;
  deleteSession(tokenHash: string): Promise<void>;

  // Enrolments (enrolling twice in one course is a StoreConflictError)
  createEnrolment(input: NewEnrolment): Promise<EnrolmentRow>;
  getEnrolment(id: string): Promise<EnrolmentRow | undefined>;
  listEnrolments(graduateId: string): Promise<EnrolmentRow[]>;

  // Certificates (issuing twice for one enrolment is a StoreConflictError)
  createCertificate(input: NewCertificate): Promise<CertificateRow>;
  getCertificate(certificateNo: string): Promise<CertificateDetailRow | undefined>;
  listCertificates(graduateId: string): Promise<CertificateRow[]>;

  // Bookings (only pending bookings can change or be cancelled)
  createBooking(input: NewBooking): Promise<BookingRow>;
  getBooking(id: string): Promise<BookingRow | undefined>;
  listBookingsForCentre(centreId: string): Promise<BookingRow[]>;
  updateBooking(id: string, change: BookingChange): Promise<BookingOutcome>;
  decideBooking(id: string, status: 'confirmed' | 'declined'): Promise<BookingOutcome>;
  deleteBooking(id: string): Promise<BookingOutcome>;

  // Kazi applications (application_id is the id Kazi gave us; saving it twice is a StoreConflictError)
  createKaziApplication(input: NewKaziApplication): Promise<KaziApplicationRow>;
  getKaziApplication(applicationId: string): Promise<KaziApplicationRow | undefined>;
  listKaziApplications(graduateId: string): Promise<KaziApplicationRow[]>;
  /** Every pending application of every graduate: the subscriber reopens these on start. */
  listPendingKaziApplications(): Promise<KaziApplicationRow[]>;
  updateKaziApplication(applicationId: string, change: KaziApplicationChange): Promise<KaziApplicationRow | undefined>;
  deleteKaziApplication(applicationId: string): Promise<boolean>;
}
