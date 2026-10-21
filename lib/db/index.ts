import { MemoryStore } from './memoryStore';
import type { Store } from './types';

// One Store per process. It lives on globalThis because Next compiles each route handler into its
// own bundle, and every bundle gets its own copy of this module: a module-level variable would give
// each route a different in-memory database. server.ts and the tests share this one too.
const shared = globalThis as typeof globalThis & { __ujuziStore?: Store };

export function getStore(): Store {
  shared.__ujuziStore ??= createStore();
  return shared.__ujuziStore;
}

function createStore(): Store {
  if (process.env.DATABASE_URL) {
    // TODO(Phase 5): return new PgStore(...) from ./pgStore once the schema and Store are approved.
    throw new Error(
      'DATABASE_URL is set but the PostgreSQL store is not written yet. Unset DATABASE_URL to use the in-memory store.',
    );
  }
  return new MemoryStore();
}
