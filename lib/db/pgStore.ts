import { types, type Pool } from 'pg';
import {
  CERTIFICATE_NO_PATTERN,
  formatCertificateNo,
  formatId,
  StoreConflictError,
  StoreReferenceError,
  type BookingChange,
  type BookingOutcome,
  type BookingRow,
  type CentreRow,
  type CertificateDetailRow,
  type CertificateRow,
  type CourseDetailRow,
  type CourseFilter,
  type EnrolmentRow,
  type IdKind,
  type KaziApplicationChange,
  type KaziApplicationRow,
  type KaziApplicationStatus,
  type NewBooking,
  type NewCentre,
  type NewCertificate,
  type NewCourse,
  type NewEnrolment,
  type NewKaziApplication,
  type NewSession,
  type NewUser,
  type SessionRow,
  type Store,
  type UserRow,
} from './types';

// A SQL `date` (issued_on) stays the plain string 2026-08-14. By default pg turns it into a Date at
// local midnight, which shifts the day when the server's time zone is not UTC.
types.setTypeParser(types.builtins.DATE, (value) => value);

const SEQUENCES: Record<IdKind | 'certificate', string> = {
  centre: 'centre_seq',
  course: 'course_seq',
  graduate: 'graduate_seq',
  staff: 'staff_seq',
  enrolment: 'enrolment_seq',
  booking: 'booking_seq',
  certificate: 'certificate_seq',
};

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
  message: string;
}

const isPgError = (err: unknown): err is PgError => typeof err === 'object' && err !== null && 'code' in err;

/** Turns the database's constraint errors into the Store's own errors; anything else passes through. */
function translate(err: unknown): unknown {
  if (!isPgError(err)) return err;
  if (err.code === UNIQUE_VIOLATION) return new StoreConflictError(err.detail ?? err.message);
  if (err.code === FOREIGN_KEY_VIOLATION) return new StoreReferenceError(err.detail ?? err.message);
  return err;
}

// Selects a course with its centre's name, county and area: the CourseDetailRow shape.
const COURSE_DETAIL = `
  SELECT c.*, ce.name AS centre_name, ce.county, ce.area
  FROM courses c JOIN centres ce ON ce.id = c.centre_id`;

// Ids share a prefix and grow in number, so shorter-then-alphabetical is numeric order.
const BY_ID = (alias: string) => `ORDER BY length(${alias}.id), ${alias}.id`;

/** The PostgreSQL Store. Must behave exactly like MemoryStore; __tests__/store.test.ts runs both. */
export class PgStore implements Store {
  constructor(private readonly pool: Pool) {}

  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      throw translate(err);
    }
  }

  private async rows<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
    // pg types rows loosely and rejects interfaces as the row type, so the cast to the Row
    // interface is made here, once; every query below selects exactly that interface's columns.
    return (await this.pool.query(sql, params)).rows as T[];
  }

  private async one<T extends object>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.rows<T>(sql, params))[0];
  }

  private async nextNumber(kind: IdKind | 'certificate'): Promise<number> {
    const row = await this.one<{ n: string }>('SELECT nextval($1::regclass) AS n', [SEQUENCES[kind]]);
    return Number(row!.n);
  }

  private async nextId(kind: IdKind): Promise<string> {
    return formatId(kind, await this.nextNumber(kind));
  }

  // ---- Centres ----------------------------------------------------------------------------------

  async createCentre(input: NewCentre): Promise<CentreRow> {
    const id = await this.nextId('centre');
    return (await this.one<CentreRow>(
      'INSERT INTO centres (id, name, county, area) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, input.name, input.county, input.area],
    ))!;
  }

  listCentres(): Promise<CentreRow[]> {
    return this.rows<CentreRow>(`SELECT * FROM centres c ${BY_ID('c')}`);
  }

  getCentre(id: string): Promise<CentreRow | undefined> {
    return this.one<CentreRow>('SELECT * FROM centres WHERE id = $1', [id]);
  }

  // ---- Courses ----------------------------------------------------------------------------------

  createCourse(input: NewCourse): Promise<CourseDetailRow> {
    return this.run(async () => {
      const id = await this.nextId('course');
      return (await this.one<CourseDetailRow>(
        `WITH c AS (
           INSERT INTO courses (id, centre_id, title, category, duration_weeks, fee_kes, next_start, certificate_level)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
         )
         SELECT c.*, ce.name AS centre_name, ce.county, ce.area FROM c JOIN centres ce ON ce.id = c.centre_id`,
        [id, input.centre_id, input.title, input.category, input.duration_weeks, input.fee_kes, input.next_start, input.certificate_level],
      ))!;
    });
  }

  updateCourse(id: string, input: NewCourse): Promise<CourseDetailRow | undefined> {
    return this.run(() =>
      this.one<CourseDetailRow>(
        `WITH c AS (
           UPDATE courses SET centre_id = $2, title = $3, category = $4, duration_weeks = $5,
                  fee_kes = $6, next_start = $7, certificate_level = $8
           WHERE id = $1 RETURNING *
         )
         SELECT c.*, ce.name AS centre_name, ce.county, ce.area FROM c JOIN centres ce ON ce.id = c.centre_id`,
        [id, input.centre_id, input.title, input.category, input.duration_weeks, input.fee_kes, input.next_start, input.certificate_level],
      ),
    );
  }

  listCourses(filter: CourseFilter = {}): Promise<CourseDetailRow[]> {
    return this.rows<CourseDetailRow>(
      `${COURSE_DETAIL}
       WHERE ($1::text IS NULL OR c.category = $1) AND ($2::text IS NULL OR lower(ce.county) = lower($2))
       ${BY_ID('c')}`,
      [filter.category ?? null, filter.county ?? null],
    );
  }

  getCourse(id: string): Promise<CourseDetailRow | undefined> {
    return this.one<CourseDetailRow>(`${COURSE_DETAIL} WHERE c.id = $1`, [id]);
  }

  // ---- Users and sessions -----------------------------------------------------------------------

  createUser(input: NewUser): Promise<UserRow> {
    return this.run(async () => {
      // Same rule as the CHECK on users, with the same message as MemoryStore.
      if ((input.role === 'staff') !== (input.centre_id !== null)) {
        throw new Error('A staff user needs a centre and a graduate must not have one');
      }
      const id = await this.nextId(input.role === 'staff' ? 'staff' : 'graduate');
      return (await this.one<UserRow>(
        `INSERT INTO users (id, role, email, password_hash, first_name, last_name, centre_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [id, input.role, input.email, input.password_hash, input.first_name, input.last_name, input.centre_id],
      ))!;
    });
  }

  getUser(id: string): Promise<UserRow | undefined> {
    return this.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  }

  getUserByEmail(email: string): Promise<UserRow | undefined> {
    return this.one<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  }

  createSession(input: NewSession): Promise<SessionRow> {
    return this.run(async () =>
      (await this.one<SessionRow>(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3) RETURNING *',
        [input.token_hash, input.user_id, input.expires_at],
      ))!,
    );
  }

  getSession(tokenHash: string): Promise<SessionRow | undefined> {
    return this.one<SessionRow>('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  // ---- Enrolments -------------------------------------------------------------------------------

  createEnrolment(input: NewEnrolment): Promise<EnrolmentRow> {
    return this.run(async () => {
      const id = await this.nextId('enrolment');
      return (await this.one<EnrolmentRow>(
        'INSERT INTO enrolments (id, graduate_id, course_id) VALUES ($1, $2, $3) RETURNING *',
        [id, input.graduate_id, input.course_id],
      ))!;
    });
  }

  getEnrolment(id: string): Promise<EnrolmentRow | undefined> {
    return this.one<EnrolmentRow>('SELECT * FROM enrolments WHERE id = $1', [id]);
  }

  listEnrolments(graduateId: string): Promise<EnrolmentRow[]> {
    return this.rows<EnrolmentRow>(`SELECT * FROM enrolments e WHERE e.graduate_id = $1 ${BY_ID('e')}`, [graduateId]);
  }

  // ---- Certificates -----------------------------------------------------------------------------

  async createCertificate(input: NewCertificate): Promise<CertificateRow> {
    const { certificate_no: named, ...fields } = input;
    if (named !== undefined && !CERTIFICATE_NO_PATTERN.test(named)) {
      throw new Error(`Certificate number ${named} is malformed`);
    }
    const year = Number(fields.issued_on.slice(0, 4));
    const insert = (certificateNo: string) =>
      this.one<CertificateRow>(
        `INSERT INTO certificates (certificate_no, enrolment_id, course_title, level, issued_on)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [certificateNo, fields.enrolment_id, fields.course_title, fields.level, fields.issued_on],
      );

    for (;;) {
      const certificateNo = named ?? formatCertificateNo(year, await this.nextNumber('certificate'));
      try {
        return (await insert(certificateNo))!;
      } catch (err) {
        // An automatic number that is already taken (seed data names its own): take the next one.
        if (named === undefined && isPgError(err) && err.constraint === 'certificates_pkey') continue;
        throw translate(err);
      }
    }
  }

  getCertificate(certificateNo: string): Promise<CertificateDetailRow | undefined> {
    return this.one<CertificateDetailRow>(
      `SELECT c.*, u.first_name AS holder_first_name, u.last_name AS holder_last_name
       FROM certificates c
       JOIN enrolments e ON e.id = c.enrolment_id
       JOIN users u ON u.id = e.graduate_id
       WHERE c.certificate_no = $1`,
      [certificateNo],
    );
  }

  listCertificates(graduateId: string): Promise<CertificateRow[]> {
    return this.rows<CertificateRow>(
      `SELECT c.* FROM certificates c JOIN enrolments e ON e.id = c.enrolment_id
       WHERE e.graduate_id = $1 ORDER BY c.certificate_no`,
      [graduateId],
    );
  }

  revokeCertificate(certificateNo: string): Promise<CertificateRow | undefined> {
    return this.one<CertificateRow>(
      'UPDATE certificates SET revoked_at = COALESCE(revoked_at, now()) WHERE certificate_no = $1 RETURNING *',
      [certificateNo],
    );
  }

  // ---- Bookings ---------------------------------------------------------------------------------

  createBooking(input: NewBooking): Promise<BookingRow> {
    return this.run(async () => {
      const id = await this.nextId('booking');
      return (await this.one<BookingRow>(
        `INSERT INTO bookings (id, course_id, event_name, crew_size, preferred_start)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, input.course_id, input.event_name, input.crew_size, input.preferred_start],
      ))!;
    });
  }

  getBooking(id: string): Promise<BookingRow | undefined> {
    return this.one<BookingRow>('SELECT * FROM bookings WHERE id = $1', [id]);
  }

  listBookingsForCentre(centreId: string): Promise<BookingRow[]> {
    return this.rows<BookingRow>(
      `SELECT b.* FROM bookings b JOIN courses c ON c.id = b.course_id
       WHERE c.centre_id = $1 ${BY_ID('b')}`,
      [centreId],
    );
  }

  // The change and the "still pending" check are one UPDATE or DELETE, so they cannot race. When
  // it changes nothing, a second read tells "no such booking" from "no longer pending".
  private async pendingOnly(statement: string, params: unknown[]): Promise<BookingOutcome> {
    const changed = await this.one<BookingRow>(statement, params);
    if (changed) return { kind: 'ok', booking: changed };
    const existing = await this.getBooking(params[0] as string);
    return existing ? { kind: 'not_pending', booking: existing } : { kind: 'not_found' };
  }

  updateBooking(id: string, change: BookingChange): Promise<BookingOutcome> {
    return this.pendingOnly(
      "UPDATE bookings SET crew_size = $2, preferred_start = $3 WHERE id = $1 AND status = 'pending' RETURNING *",
      [id, change.crew_size, change.preferred_start],
    );
  }

  decideBooking(id: string, status: 'confirmed' | 'declined'): Promise<BookingOutcome> {
    return this.pendingOnly("UPDATE bookings SET status = $2 WHERE id = $1 AND status = 'pending' RETURNING *", [id, status]);
  }

  deleteBooking(id: string): Promise<BookingOutcome> {
    return this.pendingOnly("DELETE FROM bookings WHERE id = $1 AND status = 'pending' RETURNING *", [id]);
  }

  // ---- Kazi applications ------------------------------------------------------------------------

  createKaziApplication(input: NewKaziApplication): Promise<KaziApplicationRow> {
    return this.run(async () =>
      (await this.one<KaziApplicationRow>(
        `INSERT INTO kazi_applications (application_id, graduate_id, job_id, preferred_date, note, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [input.application_id, input.graduate_id, input.job_id, input.preferred_date, input.note, input.status],
      ))!,
    );
  }

  getKaziApplication(applicationId: string): Promise<KaziApplicationRow | undefined> {
    return this.one<KaziApplicationRow>('SELECT * FROM kazi_applications WHERE application_id = $1', [applicationId]);
  }

  listKaziApplications(graduateId: string): Promise<KaziApplicationRow[]> {
    return this.rows<KaziApplicationRow>(
      'SELECT * FROM kazi_applications WHERE graduate_id = $1 ORDER BY created_at, application_id',
      [graduateId],
    );
  }

  listPendingKaziApplications(): Promise<KaziApplicationRow[]> {
    return this.rows<KaziApplicationRow>(
      "SELECT * FROM kazi_applications WHERE status = 'pending' ORDER BY created_at, application_id",
    );
  }

  updateKaziApplication(
    applicationId: string,
    change: KaziApplicationChange,
    onlyIfStatus?: KaziApplicationStatus,
  ): Promise<KaziApplicationRow | undefined> {
    // A field left out of `change` keeps its stored value (COALESCE over a NULL parameter).
    return this.one<KaziApplicationRow>(
      `UPDATE kazi_applications
       SET preferred_date = COALESCE($2, preferred_date), note = COALESCE($3, note),
           status = COALESCE($4, status), updated_at = now()
       WHERE application_id = $1 AND ($5::text IS NULL OR status = $5) RETURNING *`,
      [applicationId, change.preferred_date ?? null, change.note ?? null, change.status ?? null, onlyIfStatus ?? null],
    );
  }

  async deleteKaziApplication(applicationId: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM kazi_applications WHERE application_id = $1', [applicationId]);
    return (result.rowCount ?? 0) > 0;
  }
}
