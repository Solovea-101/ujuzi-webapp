import { MemoryStore } from '@/lib/db/memoryStore';
import { StoreConflictError, StoreReferenceError, type NewCourse, type Store } from '@/lib/db/types';
import { pgTestStores, TEST_DATABASE_URL } from './helpers/pgTestStore';

// One suite, run against every Store implementation: the in-memory store always, PostgreSQL when
// TEST_DATABASE_URL is set. Passing on both is what "identical behaviour" means.

const FUTURE = new Date('2027-01-15T09:00:00Z');

async function withCentresAndCourses(store: Store) {
  const westlands = await store.createCentre({ name: 'Westlands Skills Centre', county: 'Nairobi', area: 'Westlands' });
  const nyali = await store.createCentre({ name: 'Nyali Training Centre', county: 'Mombasa', area: 'Nyali' });
  const course = (centre_id: string, over: Partial<NewCourse> = {}): NewCourse => ({
    centre_id,
    title: 'Food hygiene and event service',
    category: 'catering',
    duration_weeks: 2,
    fee_kes: 3500,
    next_start: FUTURE,
    certificate_level: 'short-course',
    ...over,
  });
  const catering = await store.createCourse(course(westlands.id));
  const plumbing = await store.createCourse(course(nyali.id, { title: 'Basic plumbing', category: 'plumbing' }));
  return { westlands, nyali, catering, plumbing };
}

const graduate = (over = {}) => ({
  role: 'graduate' as const,
  email: 'achieng@example.com',
  password_hash: 'scrypt$hash',
  first_name: 'Achieng',
  last_name: 'Otieno',
  centre_id: null,
  ...over,
});

function storeContract(name: string, fresh: () => Promise<Store>) {
  describe(name, () => {
    describe('ids', () => {
      it('start where the contract examples do', async () => {
        const store = await fresh();
        const { westlands, catering } = await withCentresAndCourses(store);
        const grad = await store.createUser(graduate());
        const staff = await store.createUser(graduate({ role: 'staff', email: 'staff@example.com', centre_id: westlands.id }));
        const enrolment = await store.createEnrolment({ graduate_id: grad.id, course_id: catering.id });
        const booking = await store.createBooking({
          course_id: catering.id, event_name: 'Wedding', crew_size: 6, preferred_start: FUTURE,
        });
        const certificate = await store.createCertificate({
          enrolment_id: enrolment.id, course_title: catering.title, level: 'short-course', issued_on: '2026-08-14',
        });

        expect(westlands.id).toBe('cen_11');
        expect(catering.id).toBe('crs_501');
        expect(grad.id).toBe('grd_0101');
        expect(staff.id).toBe('usr_0001');
        expect(enrolment.id).toBe('enr_0001');
        expect(booking.id).toBe('bkg_6001');
        expect(certificate.certificate_no).toBe('UJZ-2026-00001');
      });
    });

    describe('courses', () => {
      it('joins the centre and filters by category and county, ignoring case', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);

        expect(catering).toMatchObject({ centre_name: 'Westlands Skills Centre', county: 'Nairobi', area: 'Westlands' });
        expect((await store.listCourses()).map((c) => c.id)).toEqual(['crs_501', 'crs_502']);
        expect((await store.listCourses({ county: 'nAiRoBi' })).map((c) => c.id)).toEqual(['crs_501']);
        expect((await store.listCourses({ category: 'plumbing' })).map((c) => c.id)).toEqual(['crs_502']);
        expect(await store.listCourses({ category: 'plumbing', county: 'Nairobi' })).toEqual([]);
      });

      it('answers undefined for an unknown course and refuses a course at an unknown centre', async () => {
        const store = await fresh();
        expect(await store.getCourse('crs_999')).toBeUndefined();
        await expect(
          store.createCourse({
            centre_id: 'cen_99', title: 'x', category: 'events', duration_weeks: 1, fee_kes: 0,
            next_start: FUTURE, certificate_level: 'short-course',
          }),
        ).rejects.toBeInstanceOf(StoreReferenceError);
      });

      it('replaces a course on update and answers undefined when it does not exist', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        const { id, centre_name, county, area, ...fields } = catering;
        const updated = await store.updateCourse(id, { ...fields, fee_kes: 4000 });
        expect(updated?.fee_kes).toBe(4000);
        expect((await store.getCourse(id))?.fee_kes).toBe(4000);
        expect(await store.updateCourse('crs_999', fields)).toBeUndefined();
      });

      it('hands out copies, so editing a result never edits the store', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        catering.title = 'Changed';
        catering.next_start.setFullYear(1999);
        const again = await store.getCourse(catering.id);
        expect(again?.title).toBe('Food hygiene and event service');
        expect(again?.next_start).toEqual(FUTURE);
      });
    });

    describe('users and sessions', () => {
      it('refuses a second account with the same email, ignoring case', async () => {
        const store = await fresh();
        await store.createUser(graduate());
        await expect(store.createUser(graduate({ email: 'ACHIENG@example.com' }))).rejects.toBeInstanceOf(StoreConflictError);
        expect((await store.getUserByEmail('Achieng@Example.com'))?.id).toBe('grd_0101');
      });

      it('keeps staff tied to a centre and graduates free of one', async () => {
        const store = await fresh();
        const { westlands } = await withCentresAndCourses(store);
        await expect(store.createUser(graduate({ role: 'staff', centre_id: null }))).rejects.toThrow(/needs a centre/);
        await expect(store.createUser(graduate({ centre_id: westlands.id }))).rejects.toThrow(/needs a centre/);
        await expect(store.createUser(graduate({ role: 'staff', centre_id: 'cen_99' }))).rejects.toBeInstanceOf(StoreReferenceError);
      });

      it('stores a session by token hash and removes it on logout', async () => {
        const store = await fresh();
        const user = await store.createUser(graduate());
        await store.createSession({ token_hash: 'abc123', user_id: user.id, expires_at: FUTURE });
        expect((await store.getSession('abc123'))?.user_id).toBe(user.id);
        await store.deleteSession('abc123');
        expect(await store.getSession('abc123')).toBeUndefined();
      });
    });

    describe('enrolments and certificates', () => {
      it('refuses a second enrolment in the same course', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        const grad = await store.createUser(graduate());
        await store.createEnrolment({ graduate_id: grad.id, course_id: catering.id });
        await expect(store.createEnrolment({ graduate_id: grad.id, course_id: catering.id })).rejects.toBeInstanceOf(StoreConflictError);
        expect(await store.listEnrolments(grad.id)).toHaveLength(1);
        expect(await store.listEnrolments('grd_0999')).toEqual([]);
      });

      it('looks a certificate up with its holder and issues one per enrolment', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        const grad = await store.createUser(graduate());
        const enrolment = await store.createEnrolment({ graduate_id: grad.id, course_id: catering.id });
        const input = { enrolment_id: enrolment.id, course_title: catering.title, level: 'short-course' as const, issued_on: '2026-08-14' };
        const issued = await store.createCertificate(input);

        expect(await store.getCertificate(issued.certificate_no)).toEqual({
          ...issued, holder_first_name: 'Achieng', holder_last_name: 'Otieno',
        });
        expect(issued.revoked_at).toBeNull();
        expect(await store.getCertificate('UJZ-2026-99999')).toBeUndefined();
        await expect(store.createCertificate(input)).rejects.toBeInstanceOf(StoreConflictError);
        expect((await store.listCertificates(grad.id)).map((c) => c.certificate_no)).toEqual([issued.certificate_no]);
      });
    });

    describe('certificate numbers and revoking', () => {
      async function twoEnrolments(store: Store) {
        const { catering } = await withCentresAndCourses(store);
        const achieng = await store.createUser(graduate());
        const brian = await store.createUser(graduate({ email: 'brian@example.com', first_name: 'Brian', last_name: 'Kamau' }));
        const first = await store.createEnrolment({ graduate_id: achieng.id, course_id: catering.id });
        const second = await store.createEnrolment({ graduate_id: brian.id, course_id: catering.id });
        const fields = { course_title: catering.title, level: 'short-course' as const, issued_on: '2026-08-14' };
        return { first, second, fields, achieng };
      }

      it('keeps a number it is given and refuses to reuse it', async () => {
        const store = await fresh();
        const { first, second, fields } = await twoEnrolments(store);
        const issued = await store.createCertificate({ ...fields, enrolment_id: first.id, certificate_no: 'UJZ-2026-00123' });
        expect(issued.certificate_no).toBe('UJZ-2026-00123');
        await expect(
          store.createCertificate({ ...fields, enrolment_id: second.id, certificate_no: 'UJZ-2026-00123' }),
        ).rejects.toBeInstanceOf(StoreConflictError);
      });

      it('refuses a malformed number', async () => {
        const store = await fresh();
        const { first, fields } = await twoEnrolments(store);
        await expect(
          store.createCertificate({ ...fields, enrolment_id: first.id, certificate_no: 'UJZ-26-1' }),
        ).rejects.toThrow(/malformed/);
      });

      it('skips a number that is already taken when it numbers one itself', async () => {
        const store = await fresh();
        const { first, second, fields } = await twoEnrolments(store);
        await store.createCertificate({ ...fields, enrolment_id: first.id, certificate_no: 'UJZ-2026-00001' });
        const next = await store.createCertificate({ ...fields, enrolment_id: second.id });
        expect(next.certificate_no).toBe('UJZ-2026-00002');
      });

      it('revokes once, keeps the first date, and says nothing for an unknown number', async () => {
        const store = await fresh();
        const { first, fields } = await twoEnrolments(store);
        const issued = await store.createCertificate({ ...fields, enrolment_id: first.id });
        const revoked = await store.revokeCertificate(issued.certificate_no);
        expect(revoked?.revoked_at).toBeInstanceOf(Date);
        expect((await store.getCertificate(issued.certificate_no))?.revoked_at).toEqual(revoked?.revoked_at);
        expect((await store.revokeCertificate(issued.certificate_no))?.revoked_at).toEqual(revoked?.revoked_at);
        expect(await store.revokeCertificate('UJZ-2026-99999')).toBeUndefined();
      });

      it('lists a graduate\'s certificates by number, not by when they were made', async () => {
        const store = await fresh();
        const { catering, plumbing } = await withCentresAndCourses(store);
        const grad = await store.createUser(graduate());
        const forCatering = await store.createEnrolment({ graduate_id: grad.id, course_id: catering.id });
        const forPlumbing = await store.createEnrolment({ graduate_id: grad.id, course_id: plumbing.id });
        const common = { level: 'short-course' as const, issued_on: '2026-08-14' };
        await store.createCertificate({ ...common, enrolment_id: forPlumbing.id, course_title: plumbing.title, certificate_no: 'UJZ-2026-00200' });
        await store.createCertificate({ ...common, enrolment_id: forCatering.id, course_title: catering.title, certificate_no: 'UJZ-2026-00100' });
        expect((await store.listCertificates(grad.id)).map((c) => c.certificate_no)).toEqual(['UJZ-2026-00100', 'UJZ-2026-00200']);
      });
    });

    describe('bookings', () => {
      const newBooking = (course_id: string) => ({ course_id, event_name: 'Wedding', crew_size: 6, preferred_start: FUTURE });

      it('are created pending, listed per centre and changed while pending', async () => {
        const store = await fresh();
        const { catering, plumbing, westlands } = await withCentresAndCourses(store);
        const mine = await store.createBooking(newBooking(catering.id));
        await store.createBooking(newBooking(plumbing.id));

        expect(mine.status).toBe('pending');
        expect((await store.listBookingsForCentre(westlands.id)).map((b) => b.id)).toEqual([mine.id]);

        const later = new Date('2027-02-01T08:00:00Z');
        const outcome = await store.updateBooking(mine.id, { crew_size: 8, preferred_start: later });
        expect(outcome).toMatchObject({ kind: 'ok', booking: { crew_size: 8, preferred_start: later } });
        // PUT is idempotent: the same change again gives the same result.
        expect(await store.updateBooking(mine.id, { crew_size: 8, preferred_start: later })).toEqual(outcome);
      });

      it('can no longer be changed, decided again or cancelled once confirmed', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        const booking = await store.createBooking(newBooking(catering.id));

        expect(await store.decideBooking(booking.id, 'confirmed')).toMatchObject({ kind: 'ok', booking: { status: 'confirmed' } });
        expect(await store.updateBooking(booking.id, { crew_size: 2, preferred_start: FUTURE })).toMatchObject({ kind: 'not_pending' });
        expect(await store.decideBooking(booking.id, 'declined')).toMatchObject({ kind: 'not_pending' });
        expect(await store.deleteBooking(booking.id)).toMatchObject({ kind: 'not_pending' });
        expect((await store.getBooking(booking.id))?.status).toBe('confirmed');
      });

      it('are removed when cancelled, and unknown ids are not_found', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        const booking = await store.createBooking(newBooking(catering.id));

        expect(await store.deleteBooking(booking.id)).toMatchObject({ kind: 'ok' });
        expect(await store.getBooking(booking.id)).toBeUndefined();
        expect(await store.deleteBooking(booking.id)).toEqual({ kind: 'not_found' });
        expect(await store.updateBooking('bkg_9999', { crew_size: 1, preferred_start: FUTURE })).toEqual({ kind: 'not_found' });
        await expect(store.createBooking(newBooking('crs_999'))).rejects.toBeInstanceOf(StoreReferenceError);
      });
    });

    describe('one pending booking per course and event name', () => {
      const booking = (course_id: string, event_name: string) => ({ course_id, event_name, crew_size: 6, preferred_start: FUTURE });

      it('refuses a second pending booking for the same event, ignoring case', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        await store.createBooking(booking(catering.id, 'Kamau reunion'));
        await expect(store.createBooking(booking(catering.id, 'Kamau reunion'))).rejects.toBeInstanceOf(StoreConflictError);
        await expect(store.createBooking(booking(catering.id, 'KAMAU REUNION'))).rejects.toBeInstanceOf(StoreConflictError);
      });

      it('allows the same event name on another course, and another event on the same course', async () => {
        const store = await fresh();
        const { catering, plumbing } = await withCentresAndCourses(store);
        await store.createBooking(booking(catering.id, 'Kamau reunion'));
        await expect(store.createBooking(booking(plumbing.id, 'Kamau reunion'))).resolves.toMatchObject({ status: 'pending' });
        await expect(store.createBooking(booking(catering.id, 'Otieno wedding'))).resolves.toMatchObject({ status: 'pending' });
      });

      it('allows the event again once the first booking is decided or cancelled', async () => {
        const store = await fresh();
        const { catering } = await withCentresAndCourses(store);
        const first = await store.createBooking(booking(catering.id, 'Kamau reunion'));
        await store.decideBooking(first.id, 'declined');
        const second = await store.createBooking(booking(catering.id, 'Kamau reunion'));
        await store.deleteBooking(second.id);
        await expect(store.createBooking(booking(catering.id, 'Kamau reunion'))).resolves.toMatchObject({ status: 'pending' });
      });

      it('creates nothing when it refuses', async () => {
        const store = await fresh();
        const { catering, westlands } = await withCentresAndCourses(store);
        await store.createBooking(booking(catering.id, 'Kamau reunion'));
        await expect(store.createBooking(booking(catering.id, 'kamau reunion'))).rejects.toBeInstanceOf(StoreConflictError);
        expect(await store.listBookingsForCentre(westlands.id)).toHaveLength(1);
      });
    });

    describe('kazi applications', () => {
      it('changes an application only if it still has the status the caller read (an atomic compare-and-set)', async () => {
        const store = await fresh();
        const grad = await store.createUser(graduate());
        await store.createKaziApplication({
          application_id: 'app_2000', graduate_id: grad.id, job_id: 'job_1', preferred_date: FUTURE, note: '', status: 'pending',
        });
        const results = await Promise.all(
          (['accepted', 'filled', 'cancelled'] as const).map((status) => store.updateKaziApplication('app_2000', { status }, 'pending')),
        );
        expect(results.filter((row) => row !== undefined)).toHaveLength(1);
        expect(await store.updateKaziApplication('app_2000', { status: 'cancelled' }, 'pending')).toBeUndefined();
        expect(await store.updateKaziApplication('app_9999', { status: 'accepted' }, 'pending')).toBeUndefined();
        expect((await store.updateKaziApplication('app_2000', { note: 'no condition' }))?.note).toBe('no condition');
      });

      it('are saved by Kazi id, listed per graduate and followed while pending', async () => {
        const store = await fresh();
        const grad = await store.createUser(graduate());
        const input = {
          application_id: 'app_1005', graduate_id: grad.id, job_id: 'job_12345',
          preferred_date: FUTURE, note: '', status: 'pending' as const,
        };
        await store.createKaziApplication(input);
        await store.createKaziApplication({ ...input, application_id: 'app_1006' });
        await expect(store.createKaziApplication(input)).rejects.toBeInstanceOf(StoreConflictError);

        expect((await store.listKaziApplications(grad.id)).map((a) => a.application_id)).toEqual(['app_1005', 'app_1006']);
        expect(await store.listKaziApplications('grd_0999')).toEqual([]);

        const accepted = await store.updateKaziApplication('app_1005', { status: 'accepted' });
        expect(accepted?.status).toBe('accepted');
        expect((await store.listPendingKaziApplications()).map((a) => a.application_id)).toEqual(['app_1006']);

        expect(await store.updateKaziApplication('app_0000', { status: 'filled' })).toBeUndefined();
        expect(await store.deleteKaziApplication('app_1006')).toBe(true);
        expect(await store.deleteKaziApplication('app_1006')).toBe(false);
        expect(await store.getKaziApplication('app_1006')).toBeUndefined();
      });
    });

  });
}

storeContract('MemoryStore', async () => new MemoryStore());

const pgUrl = TEST_DATABASE_URL;
if (pgUrl) {
  let close: () => Promise<void>;
  let fresh: () => Promise<Store>;
  beforeAll(async () => {
    ({ fresh, close } = await pgTestStores(pgUrl));
  });
  afterAll(() => close());
  storeContract('PgStore', () => fresh());
} else {
  describe.skip('PgStore (set TEST_DATABASE_URL to run)', () => it('is skipped', () => undefined));
}
