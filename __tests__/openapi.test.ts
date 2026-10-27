import { readFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { startServer, type TestServer } from './helpers/server';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

describe('GET /openapi.yaml', () => {
  it('serves the contract file as it is on disk, with no key or login', async () => {
    const res = await request(app.server).get('/openapi.yaml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/yaml/);
    expect(res.text).toBe(readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
    expect(res.text).toMatch(/^  version: \d+\.\d+\.\d+$/m);
  });
});
