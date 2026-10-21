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

  it('accepts an upgrade on the feed path', async () => {
    const ws = open('/api/me/applications/feed');
    const closed = await new Promise<number>((resolve, reject) => {
      ws.on('close', resolve);
      ws.on('error', reject);
    });
    // The feed itself is a later phase: for now the socket upgrades, then closes with 1011.
    expect(closed).toBe(1011);
  });

  it('refuses an upgrade on any other path', async () => {
    const ws = open('/api/something-else');
    const error = await new Promise<Error>((resolve) => ws.on('error', resolve));
    expect(error.message).toMatch(/socket hang up|ECONNRESET/);
  });
});
