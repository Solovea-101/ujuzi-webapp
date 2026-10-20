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
  type CourseRow,
  type EnrolmentRow,
  type IdKind,
  type KaziApplicationChange,
  type KaziApplicationRow,
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

// Rows leave the store as copies, so a caller changing one cannot change what is stored. Rows are
// flat (strings, numbers, booleans, null and Dates), so copying the Dates is all a copy needs.
const copy = <T extends object>(row: T): T => {
  const out = { ...row };
  for (const key of Object.keys(out) as Array<keyof T>) {
    const value = out[key];
    if (value instanceof Date) out[key] = new Date(value) as T[keyof T];
  }
  return out;
};
const copies = <T extends object>(rows: T[]): T[] => rows.map((row) => copy(row));

/**
 * The in-memory Store: used when DATABASE_URL is unset (tests, clean clones). It enforces the same
 * rules the PostgreSQL schema does (unique email, one enrolment per course, foreign keys, the
 * staff-has-a-centre check), so code that works here works against the database. Every method is
 * synchronous inside, so each one is atomic.
 */
export class MemoryStore implements Store {
  private centres = new Map<string, CentreRow>();
  private courses = new Map<string, CourseRow>();
  private users = new Map<string, UserRow>();
  private sessions = new Map<string, SessionRow>();
  private enrolments = new Map<string, EnrolmentRow>();
  private certificates = new Map<string, CertificateRow>();
  private bookings = new Map<string, BookingRow>();
  private kaziApplications = new Map<string, KaziApplicationRow>();

  private counters: Record<IdKind | 'certificate', number> = {
    centre: 0, course: 0, graduate: 0, staff: 0, enrolment: 0, booking: 0, certificate: 0,
  };

  private nextId(kind: IdKind): string {
    this.counters[kind] += 1;
    return formatId(kind, this.counters[kind]);
  }

  private detail(course: CourseRow): CourseDetailRow {
    const centre = this.mustFindCentre(course.centre_id);
    return { ...course, centre_name: centre.name, county: centre.county, area: centre.area };
  }

  private mustFindCentre(id: string): CentreRow {
    const centre = this.centres.get(id);
    if (!centre) throw new StoreReferenceError(`No centre ${id}`);
    return centre;
  }

  private mustFindCourse(id: string): CourseRow {
    const course = this.courses.get(id);
    if (!course) throw new StoreReferenceError(`No course ${id}`);
    return course;
  }

  private mustFindUser(id: string): UserRow {
    const user = this.users.get(id);
    if (!user) throw new StoreReferenceError(`No user ${id}`);
    return user;
  }

  // ---- Centres ----------------------------------------------------------------------------------

  async createCentre(input: NewCentre): Promise<CentreRow> {
    const row: CentreRow = { id: this.nextId('centre'), ...input };
    this.centres.set(row.id, row);
    return copy(row);
  }

  async listCentres(): Promise<CentreRow[]> {
    return copies([...this.centres.values()]);
  }

  async getCentre(id: string): Promise<CentreRow | undefined> {
    return copyOrUndefined(this.centres.get(id));
  }

  // ---- Courses ----------------------------------------------------------------------------------

  async createCourse(input: NewCourse): Promise<CourseDetailRow> {
    this.mustFindCentre(input.centre_id);
    const row: CourseRow = { id: this.nextId('course'), ...input };
    this.courses.set(row.id, row);
    return copy(this.detail(row));
  }

  async updateCourse(id: string, input: NewCourse): Promise<CourseDetailRow | undefined> {
    if (!this.courses.has(id)) return undefined;
    this.mustFindCentre(input.centre_id);
    const row: CourseRow = { id, ...input };
    this.courses.set(id, row);
    return copy(this.detail(row));
  }

  async listCourses(filter: CourseFilter = {}): Promise<CourseDetailRow[]> {
    const county = filter.county?.toLowerCase();
    return [...this.courses.values()]
      .map((course) => this.detail(course))
      .filter((course) => !filter.category || course.category === filter.category)
      .filter((course) => !county || course.county.toLowerCase() === county)
      .map((row) => copy(row));
  }

  async getCourse(id: string): Promise<CourseDetailRow | undefined> {
    const course = this.courses.get(id);
    return course ? copy(this.detail(course)) : undefined;
  }

  // ---- Users and sessions -----------------------------------------------------------------------

  async createUser(input: NewUser): Promise<UserRow> {
    // Same rule as the CHECK on users: staff belong to a centre, graduates do not.
    if ((input.role === 'staff') !== (input.centre_id !== null)) {
      throw new Error('A staff user needs a centre and a graduate must not have one');
    }
    if (input.centre_id !== null) this.mustFindCentre(input.centre_id);
    if (await this.getUserByEmail(input.email)) {
      throw new StoreConflictError(`Email ${input.email} is already registered`);
    }
    const row: UserRow = {
      id: this.nextId(input.role === 'staff' ? 'staff' : 'graduate'),
      ...input,
      created_at: new Date(),
    };
    this.users.set(row.id, row);
    return copy(row);
  }

  async getUser(id: string): Promise<UserRow | undefined> {
    return copyOrUndefined(this.users.get(id));
  }

  async getUserByEmail(email: string): Promise<UserRow | undefined> {
    const wanted = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === wanted) return copy(user);
    }
    return undefined;
  }

  async createSession(input: NewSession): Promise<SessionRow> {
    this.mustFindUser(input.user_id);
    if (this.sessions.has(input.token_hash)) throw new StoreConflictError('Session already exists');
    const row: SessionRow = { ...input, created_at: new Date() };
    this.sessions.set(row.token_hash, row);
    return copy(row);
  }

  async getSession(tokenHash: string): Promise<SessionRow | undefined> {
    return copyOrUndefined(this.sessions.get(tokenHash));
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  // ---- Enrolments -------------------------------------------------------------------------------

  async createEnrolment(input: NewEnrolment): Promise<EnrolmentRow> {
    this.mustFindUser(input.graduate_id);
    this.mustFindCourse(input.course_id);
    for (const existing of this.enrolments.values()) {
      if (existing.graduate_id === input.graduate_id && existing.course_id === input.course_id) {
        throw new StoreConflictError(`${input.graduate_id} is already enrolled in ${input.course_id}`);
      }
    }
    const row: EnrolmentRow = { id: this.nextId('enrolment'), ...input, enrolled_at: new Date() };
    this.enrolments.set(row.id, row);
    return copy(row);
  }

  async getEnrolment(id: string): Promise<EnrolmentRow | undefined> {
    return copyOrUndefined(this.enrolments.get(id));
  }

  async listEnrolments(graduateId: string): Promise<EnrolmentRow[]> {
    return copies([...this.enrolments.values()].filter((e) => e.graduate_id === graduateId));
  }

  // ---- Certificates -----------------------------------------------------------------------------

  async createCertificate(input: NewCertificate): Promise<CertificateRow> {
    if (!this.enrolments.has(input.enrolment_id)) {
      throw new StoreReferenceError(`No enrolment ${input.enrolment_id}`);
    }
    for (const existing of this.certificates.values()) {
      if (existing.enrolment_id === input.enrolment_id) {
        throw new StoreConflictError(`A certificate was already issued for ${input.enrolment_id}`);
      }
    }
    const { certificate_no: named, ...fields } = input;
    let certificateNo: string;
    if (named !== undefined) {
      if (!CERTIFICATE_NO_PATTERN.test(named)) throw new Error(`Certificate number ${named} is malformed`);
      if (this.certificates.has(named)) throw new StoreConflictError(`Certificate ${named} already exists`);
      certificateNo = named;
    } else {
      // Skip numbers that seed data or an earlier call already took.
      const year = Number(input.issued_on.slice(0, 4));
      do {
        this.counters.certificate += 1;
        certificateNo = formatCertificateNo(year, this.counters.certificate);
      } while (this.certificates.has(certificateNo));
    }
    const row: CertificateRow = { certificate_no: certificateNo, ...fields, revoked_at: null };
    this.certificates.set(row.certificate_no, row);
    return copy(row);
  }

  async getCertificate(certificateNo: string): Promise<CertificateDetailRow | undefined> {
    const certificate = this.certificates.get(certificateNo);
    if (!certificate) return undefined;
    const holder = this.mustFindUser(this.enrolments.get(certificate.enrolment_id)!.graduate_id);
    return copy({ ...certificate, holder_first_name: holder.first_name, holder_last_name: holder.last_name });
  }

  async listCertificates(graduateId: string): Promise<CertificateRow[]> {
    return copies(
      [...this.certificates.values()]
        .filter((c) => this.enrolments.get(c.enrolment_id)?.graduate_id === graduateId)
        .sort((a, b) => a.certificate_no.localeCompare(b.certificate_no)),
    );
  }

  async revokeCertificate(certificateNo: string): Promise<CertificateRow | undefined> {
    const row = this.certificates.get(certificateNo);
    if (!row) return undefined;
    row.revoked_at ??= new Date();
    return copy(row);
  }

  // ---- Bookings ---------------------------------------------------------------------------------

  async createBooking(input: NewBooking): Promise<BookingRow> {
    this.mustFindCourse(input.course_id);
    const row: BookingRow = { id: this.nextId('booking'), ...input, status: 'pending', created_at: new Date() };
    this.bookings.set(row.id, row);
    return copy(row);
  }

  async getBooking(id: string): Promise<BookingRow | undefined> {
    return copyOrUndefined(this.bookings.get(id));
  }

  async listBookingsForCentre(centreId: string): Promise<BookingRow[]> {
    return copies(
      [...this.bookings.values()].filter((b) => this.courses.get(b.course_id)?.centre_id === centreId),
    );
  }

  async updateBooking(id: string, change: BookingChange): Promise<BookingOutcome> {
    const booking = this.bookings.get(id);
    if (!booking) return { kind: 'not_found' };
    if (booking.status !== 'pending') return { kind: 'not_pending', booking: copy(booking) };
    booking.crew_size = change.crew_size;
    booking.preferred_start = new Date(change.preferred_start);
    return { kind: 'ok', booking: copy(booking) };
  }

  async decideBooking(id: string, status: 'confirmed' | 'declined'): Promise<BookingOutcome> {
    const booking = this.bookings.get(id);
    if (!booking) return { kind: 'not_found' };
    if (booking.status !== 'pending') return { kind: 'not_pending', booking: copy(booking) };
    booking.status = status;
    return { kind: 'ok', booking: copy(booking) };
  }

  async deleteBooking(id: string): Promise<BookingOutcome> {
    const booking = this.bookings.get(id);
    if (!booking) return { kind: 'not_found' };
    if (booking.status !== 'pending') return { kind: 'not_pending', booking: copy(booking) };
    this.bookings.delete(id);
    return { kind: 'ok', booking: copy(booking) };
  }

  // ---- Kazi applications ------------------------------------------------------------------------

  async createKaziApplication(input: NewKaziApplication): Promise<KaziApplicationRow> {
    this.mustFindUser(input.graduate_id);
    if (this.kaziApplications.has(input.application_id)) {
      throw new StoreConflictError(`Application ${input.application_id} is already saved`);
    }
    const now = new Date();
    const row: KaziApplicationRow = { ...input, created_at: now, updated_at: now };
    this.kaziApplications.set(row.application_id, row);
    return copy(row);
  }

  async getKaziApplication(applicationId: string): Promise<KaziApplicationRow | undefined> {
    return copyOrUndefined(this.kaziApplications.get(applicationId));
  }

  async listKaziApplications(graduateId: string): Promise<KaziApplicationRow[]> {
    return copies([...this.kaziApplications.values()].filter((a) => a.graduate_id === graduateId));
  }

  async listPendingKaziApplications(): Promise<KaziApplicationRow[]> {
    return copies([...this.kaziApplications.values()].filter((a) => a.status === 'pending'));
  }

  async updateKaziApplication(
    applicationId: string,
    change: KaziApplicationChange,
  ): Promise<KaziApplicationRow | undefined> {
    const row = this.kaziApplications.get(applicationId);
    if (!row) return undefined;
    if (change.preferred_date !== undefined) row.preferred_date = new Date(change.preferred_date);
    if (change.note !== undefined) row.note = change.note;
    if (change.status !== undefined) row.status = change.status;
    row.updated_at = new Date();
    return copy(row);
  }

  async deleteKaziApplication(applicationId: string): Promise<boolean> {
    return this.kaziApplications.delete(applicationId);
  }
}

function copyOrUndefined<T extends object>(row: T | undefined): T | undefined {
  return row === undefined ? undefined : copy(row);
}
