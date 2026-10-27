import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { hashKey } from '@/lib/auth/partnerKey';
import { createServer } from '@/server';

// Tests must never pick up a developer's .env database. Next does not override variables that are
// already set, so an empty value wins over the one in .env.
process.env.DATABASE_URL = '';

// The partner key every test sends. Only its hash is configured, exactly as in production.
export const PARTNER_KEY = 'ujz_test_key_for_the_test_suite_only';
export const OTHER_PARTNER_KEY = 'ujz_a_second_partner_key_for_tests';
// Named, as in production: Sherehe's bookings are filed under "sherehe", the other key is "other".
process.env.PARTNER_KEYS = [`sherehe:${hashKey(PARTNER_KEY)}`, `other:${hashKey(OTHER_PARTNER_KEY)}`].join(',');

// Next's own flag for running inside Jest (see loadConfig in next/dist/server/config.js): it then
// loads next.config.ts with require() instead of its TypeScript loader. Without it, `prepare()`
// fails under Jest with "Cannot add property experimental, object is not extensible".
process.env.__NEXT_TEST_MODE = 'jest';

// Rate limits are far above anything a test sends, so only the rate-limit tests ever meet one. They
// lower the limit themselves, for as long as they need it.
process.env.RATE_LIMIT_PARTNER = '1000000';
process.env.RATE_LIMIT_ANON = '1000000';
process.env.RATE_LIMIT_LOGIN = '1000000';

export type TestServer = { server: Server; port: number; close: () => Promise<void> };

/** Starts createServer() on a free local port. Call close() in afterAll. */
export async function startServer(): Promise<TestServer> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const close = () =>
    new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return { server, port, close };
}

/** Requests that already carry the partner key: partner(app).get('/api/courses'). */
export function partner(app: TestServer) {
  return request.agent(app.server).set('X-API-Key', PARTNER_KEY);
}
