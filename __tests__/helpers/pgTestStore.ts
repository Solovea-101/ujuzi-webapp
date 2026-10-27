import { Pool } from 'pg';
import { migrate } from '@/lib/db/migrate';
import { PgStore } from '@/lib/db/pgStore';

/** Set TEST_DATABASE_URL to run the store tests against PostgreSQL too. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const TABLES = 'centres, courses, users, sessions, enrolments, certificates, bookings, kazi_applications, sign_in_failures';
const SEQUENCES = ['centre', 'course', 'graduate', 'staff', 'enrolment', 'booking', 'certificate'];

/**
 * A PgStore on an empty database. The tests wipe every table and restart every id sequence, so the
 * database name must contain "test": this refuses to touch anything else.
 */
export async function pgTestStores(url: string) {
  const database = new URL(url).pathname.slice(1);
  if (!/test/i.test(database)) {
    throw new Error(`TEST_DATABASE_URL points at "${database}". The store tests wipe their database, so its name must contain "test".`);
  }
  const pool = new Pool({ connectionString: url });
  await migrate(pool);
  const fresh = async () => {
    await pool.query(
      `TRUNCATE ${TABLES} CASCADE; ${SEQUENCES.map((s) => `ALTER SEQUENCE ${s}_seq RESTART`).join('; ')}`,
    );
    return new PgStore(pool);
  };
  return { fresh, close: () => pool.end() };
}
