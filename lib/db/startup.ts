import { Pool } from 'pg';

/**
 * What the server does with its database before it starts listening. With DATABASE_URL set, every
 * migration that has not run yet is applied (migrate takes a lock, so two instances starting together
 * do not collide). When SEED_ON_START=true it then fills an EMPTY database with the sample data: for
 * demos and the local ring only, because the seeded accounts share a public demo password. With no
 * DATABASE_URL the in-memory store seeds itself, so there is nothing to do.
 */
export async function prepareDatabase(log: (line: string) => void = console.log): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  const { migrate } = await import('./migrate');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const applied = await migrate(pool);
    log(applied.length > 0 ? `Applied migrations: ${applied.join(', ')}` : 'Database schema is up to date.');
  } finally {
    await pool.end();
  }

  if (process.env.SEED_ON_START === 'true') {
    const [{ getStore }, { seedStore }] = await Promise.all([import('./index'), import('./seedData')]);
    const seeded = await seedStore(await getStore());
    log(seeded ? 'Seeded sample data (SEED_ON_START=true).' : 'Database already has data; not seeding.');
  }
}
