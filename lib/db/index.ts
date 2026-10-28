import { Pool } from 'pg';
import { MemoryStore } from './memoryStore';
import { PgStore } from './pgStore';
import { seedStore } from './seedData';
import type { Store } from './types';

// One Store per process. It lives on globalThis because Next compiles each route handler into its
// own bundle, and every bundle gets its own copy of this module: a module-level variable would give
// each route a different in-memory database. server.ts and the tests share this one too.
const shared = globalThis as typeof globalThis & { __ujuziStore?: Promise<Store> };

/**
 * DATABASE_URL set: the PostgreSQL store (run `npm run db:migrate`, then `npm run db:seed`).
 * Unset: the in-memory store, filled with the sample data on first use and reset on every restart.
 */
export function getStore(): Promise<Store> {
  shared.__ujuziStore ??= createStore().catch((err) => {
    shared.__ujuziStore = undefined; // do not cache a failure; the next request tries again
    throw err;
  });
  return shared.__ujuziStore;
}

async function createStore(): Promise<Store> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    const pool = new Pool({ connectionString });
    // A hosted database drops idle connections now and then; without a listener that error would end the process.
    pool.on('error', (err) => console.error('PostgreSQL connection error (the pool reconnects on the next query):', err.message));
    return new PgStore(pool);
  }
  const store = new MemoryStore();
  await seedStore(store);
  return store;
}

/** Drops the shared store so the next getStore() builds a fresh one. For tests. */
export function resetStore(): void {
  shared.__ujuziStore = undefined;
}
