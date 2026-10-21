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
  if (connectionString) return new PgStore(new Pool({ connectionString }));
  const store = new MemoryStore();
  await seedStore(store);
  return store;
}
