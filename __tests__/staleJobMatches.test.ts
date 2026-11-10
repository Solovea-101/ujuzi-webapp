import { getSubscriber } from '@/lib/realtime/kaziSubscriber';
import { resetStore } from '@/lib/db';
import { api } from '@/lib/clientApi';
import { loggedInAs, SEEDED } from './helpers/auth';
import { useKaziStub } from './helpers/kazi';
import { partner, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, ISO_SECONDS } from './helpers/shapes';

// Week 11 as the website sees it: when Kazi cannot be reached, a graduate who looked at the jobs a moment ago
// still sees them, labelled as saved; one who has not gets a clear message; and the rest of Ujuzi carries on.

const kazi = useKaziStub();
let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());
beforeEach(() => {
  getSubscriber().stopAll();
  resetStore();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const graduate = () => loggedInAs(app, SEEDED.achieng);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('GET /api/courses/{courseId}/job-matches while Kazi is gone', () => {
  it('live data first: a bare array and no stale headers', async () => {
    const res = await (await graduate()).get('/api/courses/crs_501/job-matches');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.headers['x-data-stale']).toBeUndefined();
    expect(res.headers['x-data-as-of']).toBeUndefined();
  });

  it('Kazi stops: the same jobs, still a bare array, flagged as saved with the time they were read', async () => {
    process.env.KAZI_CACHE_MS = '20';
    const g = await graduate();
    const live = await g.get('/api/courses/crs_501/job-matches');
    await wait(50);
    await kazi.stub.down();

    const saved = await g.get('/api/courses/crs_501/job-matches');
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual(live.body);
    expect(saved.headers['x-data-stale']).toBe('true');
    expect(saved.headers['x-data-as-of']).toMatch(ISO_SECONDS);
    expect(saved.headers['access-control-expose-headers']).toContain('X-Data-Stale');
  });

  it('Kazi comes back: live data again, no flag, and nothing was changed on our side', async () => {
    process.env.KAZI_CACHE_MS = '20';
    const g = await graduate();
    await g.get('/api/courses/crs_501/job-matches');
    await wait(50);
    await kazi.stub.down();
    expect((await g.get('/api/courses/crs_501/job-matches')).headers['x-data-stale']).toBe('true');
    await kazi.stub.up();
    const back = await g.get('/api/courses/crs_501/job-matches');
    expect(back.status).toBe(200);
    expect(back.headers['x-data-stale']).toBeUndefined();
  });

  it('nothing saved yet: our own 502 with a message, never a blank or a crash', async () => {
    await kazi.stub.down();
    const res = await (await graduate()).get('/api/courses/crs_501/job-matches');
    expect(res.status).toBe(502);
    expectErrorBody(res.body, 'Kazi Connect could not be reached. Try again in a minute.');
  });

  it('the rest of Ujuzi keeps answering while Kazi is down', async () => {
    await kazi.stub.down();
    const g = await graduate();
    expect((await g.get('/api/courses/crs_501')).status).toBe(200);
    expect((await partner(app).get('/api/courses')).status).toBe(200);
    expect((await g.get('/api/me')).status).toBe(200);
  });
});

describe('the page helper reads the flag', () => {
  it('api() puts the saved time on the result when the answer says it is saved, and leaves it off otherwise', async () => {
    const original = global.fetch;
    try {
      global.fetch = (async () =>
        new Response('[]', { status: 200, headers: { 'x-data-stale': 'true', 'x-data-as-of': '2026-11-04T09:00:00Z' } })) as typeof fetch;
      expect(await api('/api/courses/crs_501/job-matches')).toEqual({ ok: true, data: [], savedAt: '2026-11-04T09:00:00Z' });
      global.fetch = (async () => new Response('[]', { status: 200 })) as typeof fetch;
      expect(await api('/api/courses/crs_501/job-matches')).toEqual({ ok: true, data: [] });
    } finally {
      global.fetch = original;
    }
  });
});
