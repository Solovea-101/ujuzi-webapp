import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { parse } from 'yaml';
import { callerOf, pathOfUrl, recordRequest, resetStats, ROUTE_TEMPLATES, routeLabel, statsSnapshot, templateFor } from '@/lib/monitoring';
import { resetKaziMetrics } from '@/lib/clients/kaziMetrics';
import { hashKey } from '@/lib/auth/partnerKey';
import { OTHER_PARTNER_KEY, PARTNER_KEY, partner, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, ISO_SECONDS } from './helpers/shapes';

// Week 12: one log line per request, and running totals at GET /api/stats.

describe('which route a request belongs to', () => {
  it('groups ids under one pattern, so the list of routes cannot grow with the ids callers send', () => {
    expect(routeLabel('GET', '/api/bookings/bkg_6001')).toBe('GET /api/bookings/{bookingId}');
    expect(routeLabel('GET', '/api/bookings/bkg_6002')).toBe('GET /api/bookings/{bookingId}');
    expect(routeLabel('GET', '/api/courses/crs_501/job-matches')).toBe('GET /api/courses/{courseId}/job-matches');
    expect(routeLabel('DELETE', '/api/me/applications/app_1005')).toBe('DELETE /api/me/applications/{id}');
  });

  it('a fixed word wins over an {id}: /api/me/applications/feed is the feed, not an application called "feed"', () => {
    expect(templateFor('/api/me/applications/feed')).toBe('/api/me/applications/feed');
  });

  it('a path no route has is "(no route)", a trailing slash is ignored, and a made-up method is OTHER', () => {
    expect(routeLabel('GET', '/api/not-a-route')).toBe('GET (no route)');
    expect(routeLabel('GET', '/api/courses/')).toBe('GET /api/courses');
    expect(routeLabel('GET', '/api/courses/crs_1/extra/deeper')).toBe('GET (no route)');
    expect(routeLabel('BREW', '/api/courses')).toBe('OTHER /api/courses');
  });

  it('the table matches openapi.yaml: every documented path has a pattern, and every pattern is documented', () => {
    const spec = parse(readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf8')) as { paths: Record<string, unknown> };
    const documented = Object.keys(spec.paths);
    for (const path of documented) expect(ROUTE_TEMPLATES).toContain(path);
    for (const template of ROUTE_TEMPLATES) expect(documented).toContain(template);
  });
});

describe('who called', () => {
  it('no credentials: none. A login token: login. A key that matches nothing: bad-key', () => {
    expect(callerOf({})).toEqual({ label: 'none' });
    expect(callerOf({ authorization: 'Bearer abc' })).toEqual({ label: 'login' });
    expect(callerOf({ 'x-api-key': 'wrong' })).toEqual({ label: 'bad-key' });
  });

  it('a valid key: key-xxxxxx (six hex characters of its hash) and the partner\'s name; the key itself is nowhere in it', () => {
    const caller = callerOf({ 'x-api-key': PARTNER_KEY });
    expect(caller).toEqual({ label: `key-${hashKey(PARTNER_KEY).slice(0, 6)}`, partner: 'sherehe' });
    expect(caller.label).toMatch(/^key-[0-9a-f]{6}$/);
    expect(JSON.stringify(caller)).not.toContain(PARTNER_KEY);
    expect(callerOf({ 'x-api-key': OTHER_PARTNER_KEY }).label).not.toBe(caller.label); // partners can be told apart
  });
});

describe('the path that is logged', () => {
  it('never has the query string or a fragment', () => {
    expect(pathOfUrl('/api/courses?county=Nairobi&email=a@b.c')).toBe('/api/courses');
    expect(pathOfUrl('/api/courses#x')).toBe('/api/courses');
    expect(pathOfUrl(undefined)).toBe('/');
  });
});

describe('the totals', () => {
  beforeEach(() => resetStats());

  it('counts 4xx as the caller\'s and 5xx as ours; the error rate is built from 5xx only', () => {
    const r = (status: number, ms: number) => recordRequest({ method: 'GET', path: '/api/courses/crs_1', status, ms, caller: 'none' });
    r(200, 10);
    r(404, 20);
    r(404, 30);
    r(500, 40);
    const s = statsSnapshot();
    expect(s).toMatchObject({ total: 4, clientErrors: 2, serverErrors: 1, errorRatePercent: 25, avgMs: 25 });
    expect(s.routes['GET /api/courses/{courseId}']).toEqual({ count: 4, clientErrors: 2, serverErrors: 1, avgMs: 25, maxMs: 40 });
    expect(s.statuses).toEqual({ '200': 1, '404': 2, '500': 1 });
  });

  it('is all zeros before any request, with no division by zero', () => {
    expect(statsSnapshot()).toMatchObject({ total: 0, errorRatePercent: 0, avgMs: 0, routes: {} });
  });
});

describe('through the real server', () => {
  let app: TestServer;
  let log: jest.SpyInstance;
  beforeAll(async () => {
    app = await startServer();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    resetStats();
    resetKaziMetrics();
    process.env.LOG_REQUESTS = 'true';
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.LOG_REQUESTS;
    jest.restoreAllMocks();
  });

  const logged = () =>
    log.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith('{') && line.includes('"method"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  const eventually = async (check: () => void) => {
    for (let i = 0; i < 50; i++) {
      try {
        return check();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    check();
  };

  it('logs one line per request: a 200 with the partner\'s label, and the rejected 401s too (the monitor runs first)', async () => {
    await partner(app).get('/api/courses');
    await request(app.server).get('/api/courses').set('X-API-Key', 'wrong');
    await request(app.server).get('/api/courses');
    await eventually(() => expect(logged()).toHaveLength(3));

    const [ok, wrongKey, noKey] = logged();
    expect(ok).toMatchObject({ method: 'GET', path: '/api/courses', status: 200, caller: `key-${hashKey(PARTNER_KEY).slice(0, 6)}`, partner: 'sherehe' });
    expect(wrongKey).toMatchObject({ status: 401, caller: 'bad-key' });
    expect(noKey).toMatchObject({ status: 401, caller: 'none' });
    for (const line of logged()) {
      expect(Object.keys(line).sort()).toEqual(expect.arrayContaining(['caller', 'method', 'ms', 'path', 'status', 'time']));
      expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(typeof line.ms).toBe('number');
      expect(line.ms as number).toBeGreaterThan(0); // a precise clock: never a rounded 0
    }
  });

  it('never logs a key, a token, a password, a body or a query string', async () => {
    await partner(app).get('/api/courses?county=Nairobi&secret=hunter2');
    await request(app.server).post('/api/auth/login').send({ email: 'someone@example.com', password: 'a-password-nobody-should-see' });
    await request(app.server).get('/api/me').set('Authorization', 'Bearer a-token-nobody-should-see');
    await eventually(() => expect(logged()).toHaveLength(3));

    const everything = log.mock.calls.map((call) => String(call[0])).join('\n');
    for (const secret of [PARTNER_KEY, hashKey(PARTNER_KEY), 'hunter2', 'county=', 'a-password-nobody-should-see', 'someone@example.com', 'a-token-nobody-should-see']) {
      expect(everything).not.toContain(secret);
    }
    expect(logged().map((l) => l.caller)).toEqual([`key-${hashKey(PARTNER_KEY).slice(0, 6)}`, 'none', 'login']);
  });

  it('a broken URL (a bad percent-encoding) is answered 400 and logged, even though it never reaches a route', async () => {
    const res = await request(app.server).get('/api/courses/%E0%A4%A').set('X-API-Key', PARTNER_KEY);
    expect(res.status).toBe(400);
    await eventually(() => expect(logged().some((l) => l.status === 400)).toBe(true));
  });

  it('does not log pages and assets: only the API', async () => {
    await request(app.server).get('/login');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(logged()).toEqual([]);
  });

  it('is quiet under test unless asked, so the suite output stays readable', async () => {
    delete process.env.LOG_REQUESTS;
    await partner(app).get('/api/courses');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(logged()).toEqual([]);
    expect(statsSnapshot().total).toBeGreaterThan(0); // but still counted
  });

  describe('GET /api/stats', () => {
    it('needs a partner key, like the rest of the partner API', async () => {
      const none = await request(app.server).get('/api/stats');
      expect(none.status).toBe(401);
      expectErrorBody(none.body);
      expect((await request(app.server).get('/api/stats').set('X-API-Key', 'wrong')).status).toBe(401);
    });

    it('reports total, 4xx and 5xx, error rate, average time and a breakdown per route', async () => {
      await partner(app).get('/api/courses');
      await partner(app).get('/api/courses/crs_501');
      await partner(app).get('/api/courses/crs_9999'); // a 404
      await partner(app).get('/api/courses/crs_9998'); // another id, the same row
      await request(app.server).get('/api/courses'); // a 401
      await request(app.server).get('/api/not-a-route');
      await eventually(() => expect(statsSnapshot().total).toBe(6));

      const res = await partner(app).get('/api/stats');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ total: 6, clientErrors: 4, serverErrors: 0, errorRatePercent: 0 });
      expect(res.body.startedAt).toMatch(ISO_SECONDS);
      expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(res.body.avgMs).toBeGreaterThan(0);
      expect(res.body.routes['GET /api/courses/{courseId}']).toMatchObject({ count: 3, clientErrors: 2, serverErrors: 0 });
      expect(res.body.routes['GET /api/courses']).toMatchObject({ count: 2, clientErrors: 1 });
      expect(res.body.routes['GET (no route)']).toMatchObject({ count: 1, clientErrors: 1 });
      expect(res.body.callers).toEqual({ [`key-${hashKey(PARTNER_KEY).slice(0, 6)}`]: 4, none: 2 });
      expect(Object.keys(res.body.routes).some((label) => label.includes('crs_'))).toBe(false); // ids never become rows
      expect(JSON.stringify(res.body)).not.toContain(PARTNER_KEY);
    });

    it('does not count itself in its own reply, but appears in the next one', async () => {
      const first = await partner(app).get('/api/stats');
      expect(first.body.total).toBe(0);
      await eventually(() => expect(statsSnapshot().total).toBe(1));
      const second = await partner(app).get('/api/stats');
      expect(second.body.routes['GET /api/stats']).toMatchObject({ count: 1 });
    });

    it('carries the state of the link to Kazi Connect', async () => {
      const res = await partner(app).get('/api/stats');
      expect(res.body.kazi).toEqual({ calls: 0, failures: 0, retries: 0, rateLimited: 0, staleServed: 0, failuresByReason: {} });
    });
  });
});
