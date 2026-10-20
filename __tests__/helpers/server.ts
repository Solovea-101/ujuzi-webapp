import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from '@/server';

// Tests must never pick up a developer's .env database. Next does not override variables that are
// already set, so an empty value wins over the one in .env.
process.env.DATABASE_URL = '';

// Next's own flag for running inside Jest (see loadConfig in next/dist/server/config.js): it then
// loads next.config.ts with require() instead of its TypeScript loader. Without it, `prepare()`
// fails under Jest with "Cannot add property experimental, object is not extensible".
process.env.__NEXT_TEST_MODE = 'jest';

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
