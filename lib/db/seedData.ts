import { loadEnvConfig } from '@next/env';
import { hashPassword } from '../auth/passwords';
import type { CertificateLevel, Category, Store } from './types';

/**
 * Sample data. Everyone here is fictional (example.com addresses) and none of it is ever sent to
 * Kazi Connect. Areas are the ones Kazi's jobs use, so job matches can find real Kazi listings.
 * Ids come from the store's counters, so on an empty store the first rows are cen_11, crs_501,
 * grd_0101, usr_0001, enr_0001 and bkg_6001, the examples in openapi.yaml.
 */

/**
 * Every seeded account (the fictional graduates and staff below) logs in with this password, unless
 * SEED_PASSWORD is set. It is public demo data: set SEED_PASSWORD on any deployment other people can reach.
 */
export const DEMO_PASSWORD = 'ujuzi-demo-pass';

let demoHash: Promise<string> | undefined;

/** One hash for all the demo accounts, made once per process: scrypt is slow on purpose. */
const seedPasswordHash = () => (demoHash ??= hashPassword(process.env.SEED_PASSWORD || DEMO_PASSWORD));

const centres = [
  { name: 'Westlands Skills Centre', county: 'Nairobi', area: 'Westlands' },
  { name: 'Hurlingham Trades Institute', county: 'Nairobi', area: 'Hurlingham' },
  { name: 'Ruaka Community Training Centre', county: 'Kiambu', area: 'Ruaka' },
  { name: 'Thika Road Technical Centre', county: 'Kiambu', area: 'Thika Road' },
  { name: 'Nyali Training Centre', county: 'Mombasa', area: 'Nyali' },
];

// centre is an index into `centres`.
const courses: Array<{
  centre: number; title: string; category: Category; weeks: number; fee: number; start: string; level: CertificateLevel;
}> = [
  { centre: 0, title: 'Food hygiene and event service', category: 'catering', weeks: 2, fee: 3500, start: '2026-11-23T07:00:00Z', level: 'short-course' },
  { centre: 0, title: 'Event setup and guest service', category: 'events', weeks: 3, fee: 4500, start: '2026-12-07T07:00:00Z', level: 'short-course' },
  { centre: 1, title: 'Basic plumbing and pipe fitting', category: 'plumbing', weeks: 6, fee: 9000, start: '2026-12-01T07:00:00Z', level: 'grade-III' },
  { centre: 1, title: 'Domestic electrical wiring', category: 'electrical', weeks: 8, fee: 12000, start: '2027-01-11T07:00:00Z', level: 'grade-III' },
  { centre: 2, title: 'Housekeeping and guest room care', category: 'accommodation', weeks: 4, fee: 6000, start: '2026-11-30T07:00:00Z', level: 'short-course' },
  { centre: 2, title: 'Commercial cleaning practice', category: 'cleaning', weeks: 2, fee: 3000, start: '2026-12-14T07:00:00Z', level: 'short-course' },
  { centre: 3, title: 'Security guarding and first aid', category: 'security', weeks: 4, fee: 5500, start: '2026-12-02T07:00:00Z', level: 'grade-II' },
  { centre: 4, title: 'Campus residence assistant', category: 'campus', weeks: 3, fee: 4000, start: '2027-01-18T07:00:00Z', level: 'short-course' },
  { centre: 4, title: 'Homework support and tutoring skills', category: 'tutoring', weeks: 2, fee: 2500, start: '2027-01-25T07:00:00Z', level: 'short-course' },
];

const graduates = [
  { first: 'Achieng', last: 'Otieno', email: 'achieng.otieno@example.com' },
  { first: 'Brian', last: 'Kamau', email: 'brian.kamau@example.com' },
  { first: 'Mwanaisha', last: 'Juma', email: 'mwanaisha.juma@example.com' },
];

// One staff member per centre, so a booking for any seeded course can be decided.
const staff = [
  { first: 'Wanjiru', last: 'Njeri', email: 'wanjiru.njeri@example.com', centre: 0 },
  { first: 'Peter', last: 'Mwangi', email: 'peter.mwangi@example.com', centre: 1 },
  { first: 'Grace', last: 'Wambui', email: 'grace.wambui@example.com', centre: 2 },
  { first: 'Joseph', last: 'Kiprop', email: 'joseph.kiprop@example.com', centre: 3 },
  { first: 'Fatuma', last: 'Hassan', email: 'fatuma.hassan@example.com', centre: 4 },
];

/** Fills an empty store with the sample data. Returns false, changing nothing, if it already has centres. */
export async function seedStore(store: Store): Promise<boolean> {
  if ((await store.listCentres()).length > 0) return false;

  const centreRows = [];
  for (const centre of centres) centreRows.push(await store.createCentre(centre));

  const courseRows = [];
  for (const c of courses) {
    courseRows.push(
      await store.createCourse({
        centre_id: centreRows[c.centre].id,
        title: c.title,
        category: c.category,
        duration_weeks: c.weeks,
        fee_kes: c.fee,
        next_start: new Date(c.start),
        certificate_level: c.level,
      }),
    );
  }

  const person = { password_hash: await seedPasswordHash() };
  const graduateRows = [];
  for (const g of graduates) {
    graduateRows.push(
      await store.createUser({ role: 'graduate', email: g.email, first_name: g.first, last_name: g.last, centre_id: null, ...person }),
    );
  }
  for (const s of staff) {
    await store.createUser({ role: 'staff', email: s.email, first_name: s.first, last_name: s.last, centre_id: centreRows[s.centre].id, ...person });
  }

  // Achieng and Brian took the catering course; Mwanaisha is enrolled in housekeeping.
  const achieng = await store.createEnrolment({ graduate_id: graduateRows[0].id, course_id: courseRows[0].id });
  const brian = await store.createEnrolment({ graduate_id: graduateRows[1].id, course_id: courseRows[0].id });
  await store.createEnrolment({ graduate_id: graduateRows[2].id, course_id: courseRows[4].id });

  const catering = courseRows[0];
  await store.createCertificate({
    certificate_no: 'UJZ-2026-00123', enrolment_id: achieng.id, course_title: catering.title, level: catering.certificate_level, issued_on: '2026-08-14',
  });
  // A revoked certificate, so the check has a valid: false case.
  await store.createCertificate({
    certificate_no: 'UJZ-2026-00124', enrolment_id: brian.id, course_title: catering.title, level: catering.certificate_level, issued_on: '2026-08-14',
  });
  await store.revokeCertificate('UJZ-2026-00124');

  await store.createBooking({
    course_id: catering.id, event_name: 'Wanjiku and Otieno wedding', crew_size: 6, preferred_start: new Date('2026-11-28T08:00:00Z'), partner: 'sherehe',
  });
  // A confirmed booking, so changing or cancelling one has a 409 case.
  const reunion = await store.createBooking({
    course_id: courseRows[1].id, event_name: 'Kamau family reunion', crew_size: 10, preferred_start: new Date('2026-12-12T08:00:00Z'), partner: 'sherehe',
  });
  await store.decideBooking(reunion.id, 'confirmed');

  return true;
}

/** `npm run db:seed`: fills an empty PostgreSQL database (run db:migrate first). */
async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Nothing to seed: the in-memory store seeds itself on every start.');
    process.exit(1);
  }
  const { getStore } = await import('./index');
  const seeded = await seedStore(await getStore());
  console.log(seeded ? 'Seeded sample data.' : 'Database already has data; nothing changed.');
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
