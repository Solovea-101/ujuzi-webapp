import { Pool } from 'pg';
import { prepareDatabase } from '@/lib/db/startup';

// Runs only with TEST_DATABASE_URL (a database whose name contains "test": this test wipes it).
const url = process.env.TEST_DATABASE_URL;
const describeWithPostgres = url && /test/i.test(new URL(url).pathname) ? describe : describe.skip;

describeWithPostgres('prepareDatabase against PostgreSQL', () => {
  const saved = { ...process.env };
  let pool: Pool;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);

  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    lines.length = 0;
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    process.env.DATABASE_URL = url;
    delete process.env.SEED_ON_START;
  });
  afterEach(() => {
    process.env.DATABASE_URL = saved.DATABASE_URL;
    process.env.SEED_ON_START = saved.SEED_ON_START;
  });

  const count = async (table: string) => Number((await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

  it('creates the schema on an empty database, and says so', async () => {
    await prepareDatabase(log);
    expect(lines[0]).toBe('Applied migrations: 001_init.sql, 002_pending_booking_unique.sql');
    expect(await count('centres')).toBe(0); // not seeded unless asked
  });

  it('does nothing the second time: the schema is already up to date', async () => {
    await prepareDatabase(log);
    lines.length = 0;
    await prepareDatabase(log);
    expect(lines).toEqual(['Database schema is up to date.']);
  });

  it('seeds an empty database when SEED_ON_START=true, once', async () => {
    process.env.SEED_ON_START = 'true';
    await prepareDatabase(log);
    expect(lines).toContain('Seeded sample data (SEED_ON_START=true).');
    expect([await count('centres'), await count('courses'), await count('users'), await count('bookings')]).toEqual([5, 9, 8, 2]);
    lines.length = 0;
    await prepareDatabase(log);
    expect(lines).toContain('Database already has data; not seeding.');
    expect(await count('courses')).toBe(9);
  });

  it('only seeds when the value is exactly "true"', async () => {
    for (const value of ['1', 'yes', 'TRUE', '']) {
      process.env.SEED_ON_START = value;
      await prepareDatabase(log);
    }
    expect(await count('centres')).toBe(0);
  });

  it('copes with two instances starting at the same moment', async () => {
    process.env.SEED_ON_START = 'true';
    await Promise.all([prepareDatabase(log), prepareDatabase(log)]);
    expect(await count('courses')).toBeGreaterThanOrEqual(9);
    expect(await count('users')).toBeGreaterThanOrEqual(8);
  });

  it('lets the seeded demo accounts log in against the database it made', async () => {
    process.env.SEED_ON_START = 'true';
    await prepareDatabase(log);
    const { verifyPassword } = await import('@/lib/auth/passwords');
    const row = (await pool.query("SELECT password_hash FROM users WHERE email = 'wanjiru.njeri@example.com'")).rows[0];
    expect(await verifyPassword('ujuzi-demo-pass', row.password_hash)).toBe(true);
    expect(await verifyPassword('wrong', row.password_hash)).toBe(false);
  });
});

it('does nothing without a DATABASE_URL: the in-memory store seeds itself', async () => {
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = '';
  const lines: string[] = [];
  await prepareDatabase((line) => lines.push(line));
  expect(lines).toEqual([]);
  process.env.DATABASE_URL = saved;
});
