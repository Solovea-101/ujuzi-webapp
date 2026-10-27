import request from 'supertest';
import { WebSocket } from 'ws';
import { startServer, type TestServer } from './helpers/server';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

describe('createServer', () => {
  it('serves the website', async () => {
    const res = await request(app.server).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ujuzi');
  });

  it('hides the framework and sends no ETag', async () => {
    const res = await request(app.server).get('/');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['etag']).toBeUndefined();
  });

  it('sends security headers on pages and answers, and keeps API answers out of caches', async () => {
    for (const path of ['/', '/api/nothing-here']) {
      const res = await request(app.server).get(path);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    }
    expect((await request(app.server).get('/api/nothing-here')).headers['cache-control']).toBe('no-store');
  });

  it('answers a path with broken percent-encoding with 400 { message }, not a bare 500', async () => {
    for (const path of ['/api/courses/%E0%A4%A', '/api/courses/%', '/%E0%A4%A']) {
      const res = await request(app.server).get(path);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'The URL is not valid.' });
    }
    expect((await request(app.server).get('/api/courses/crs_501%20')).status).not.toBe(400); // good encoding still passes
  });

  it('answers an OPTIONS preflight on /api with 204 and CORS headers', async () => {
    const res = await request(app.server)
      .options('/api/courses')
      .set('Origin', 'https://sherehe.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
    expect(res.headers['access-control-allow-headers']).toContain('X-API-Key');
  });

  it('adds CORS headers to ordinary /api responses', async () => {
    const res = await request(app.server).get('/api/nothing-here');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('answers an unknown /api path with 404 { message }', async () => {
    const res = await request(app.server).get('/api/nothing/here');
    expect(res.status).toBe(404);
    expect(res.type).toBe('application/json');
    expect(res.body).toEqual({ message: 'No endpoint GET /api/nothing/here' });
  });
});

describe('WebSocket upgrade hook', () => {
  const open = (path: string) => new WebSocket(`ws://127.0.0.1:${app.port}${path}`);

  it('accepts an upgrade on the feed path, and closes a socket that does not authenticate with 4401', async () => {
    const ws = open('/api/me/applications/feed');
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: 'not-a-token' })));
      ws.on('error', reject);
      ws.on('close', (code) => {
        try {
          expect(code).toBe(4401);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  it('refuses an upgrade on any other path', async () => {
    const ws = open('/api/something-else');
    const error = await new Promise<Error>((resolve) => ws.on('error', resolve));
    expect(error.message).toMatch(/socket hang up|ECONNRESET/);
  });
});
