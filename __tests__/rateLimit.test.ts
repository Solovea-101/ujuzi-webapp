import request from 'supertest';
import { clientAddress, limits, RateLimiter, rateLimitRequest, sharedLimiter } from '@/lib/rateLimit';
import { resetStore } from '@/lib/db';
import { DEMO_PASSWORD } from '@/lib/db/seedData';
import { OTHER_PARTNER_KEY, PARTNER_KEY, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys } from './helpers/shapes';

describe('RateLimiter', () => {
  it('allows up to max in a window, then refuses', () => {
    const limiter = new RateLimiter();
    const verdicts = Array.from({ length: 5 }, () => limiter.check('a', 3, 60_000, 1000));
    expect(verdicts.map((v) => v.allowed)).toEqual([true, true, true, false, false]);
    expect(verdicts.map((v) => v.remaining)).toEqual([2, 1, 0, 0, 0]);
  });

  it('says how long to wait, in whole seconds, rounding up and never below 1', () => {
    const limiter = new RateLimiter();
    limiter.check('a', 1, 60_000, 0);
    expect(limiter.check('a', 1, 60_000, 0).retryAfter).toBe(60);
    expect(limiter.check('a', 1, 60_000, 30_500).retryAfter).toBe(30);
    expect(limiter.check('a', 1, 60_000, 59_999).retryAfter).toBe(1);
  });

  it('starts a fresh window once the old one has ended', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 4; i++) limiter.check('a', 3, 1000, 0);
    expect(limiter.check('a', 3, 1000, 999).allowed).toBe(false);
    expect(limiter.check('a', 3, 1000, 1000).allowed).toBe(true);
  });

  it('counts every caller separately', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 3; i++) limiter.check('a', 2, 60_000, 0);
    expect(limiter.check('a', 2, 60_000, 0).allowed).toBe(false);
    expect(limiter.check('b', 2, 60_000, 0).allowed).toBe(true);
  });

  it('keeps memory bounded: a flood of different callers cannot grow it without limit', () => {
    const limiter = new RateLimiter();
    for (let i = 0; i < 25_000; i++) limiter.check(`caller-${i}`, 5, 60_000, 0);
    expect(limiter.size).toBeLessThanOrEqual(10_000);
    // and a caller that is still inside its window is still counted
    expect(limiter.check('caller-24999', 5, 60_000, 1).remaining).toBe(3);
  });

  it('clears', () => {
    const limiter = new RateLimiter();
    limiter.check('a', 1, 60_000, 0);
    limiter.clear();
    expect(limiter.size).toBe(0);
  });
});

describe('limits() and clientAddress()', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ['RATE_LIMIT_PARTNER', 'RATE_LIMIT_ANON', 'RATE_LIMIT_LOGIN', 'RATE_LIMIT_WINDOW_MS', 'TRUST_PROXY']) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('defaults to 100 a minute per partner key, 120 per address, 10 sign-ins, a 60 s window', () => {
    for (const k of ['RATE_LIMIT_PARTNER', 'RATE_LIMIT_ANON', 'RATE_LIMIT_LOGIN', 'RATE_LIMIT_WINDOW_MS']) delete process.env[k];
    expect(limits()).toEqual({ partner: 100, anonymous: 120, signIn: 10, windowMs: 60_000 });
  });

  it('ignores a setting that is not a positive number', () => {
    for (const bad of ['', 'lots', '0', '-5', 'NaN']) {
      process.env.RATE_LIMIT_PARTNER = bad;
      expect(limits().partner).toBe(100);
    }
    process.env.RATE_LIMIT_PARTNER = '7';
    expect(limits().partner).toBe(7);
  });

  it('uses the peer address, and ignores X-Forwarded-For unless TRUST_PROXY=true', () => {
    delete process.env.TRUST_PROXY;
    const headers = new Headers({ 'x-ujuzi-peer': '10.0.0.9', 'x-forwarded-for': '1.2.3.4' });
    expect(clientAddress(headers)).toBe('10.0.0.9');
    expect(clientAddress(new Headers())).toBe('unknown');
  });

  it('behind a trusted proxy uses the LAST X-Forwarded-For entry, which the client cannot forge', () => {
    process.env.TRUST_PROXY = 'true';
    expect(clientAddress(new Headers({ 'x-forwarded-for': 'forged-by-client, 203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientAddress(new Headers({ 'x-ujuzi-peer': '10.0.0.1' }))).toBe('10.0.0.1'); // no header: fall back
  });
});

describe('over HTTP', () => {
  let app: TestServer;
  const saved = { ...process.env };
  beforeAll(async () => {
    app = await startServer();
  });
  afterAll(() => app.close());
  beforeEach(() => {
    sharedLimiter().clear();
    resetStore();
  });
  afterEach(() => {
    for (const k of ['RATE_LIMIT_PARTNER', 'RATE_LIMIT_ANON', 'RATE_LIMIT_LOGIN', 'RATE_LIMIT_WINDOW_MS', 'TRUST_PROXY']) process.env[k] = saved[k];
    if (saved.TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
  });

  const get = (key: string = PARTNER_KEY) => request(app.server).get('/api/courses').set('X-API-Key', key);

  it('the handout\'s demonstration: with the limit at 3, five calls give 200 200 200 429 429', async () => {
    process.env.RATE_LIMIT_PARTNER = '3';
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await get()).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('a 429 carries a Retry-After header and a JSON body, and the same CORS headers as any answer', async () => {
    process.env.RATE_LIMIT_PARTNER = '1';
    await get();
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.type).toBe('application/json');
    const wait = Number(res.headers['retry-after']);
    expect(Number.isInteger(wait)).toBe(true);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);
    expectKeys(res.body, ['message']);
    expectErrorBody(res.body, new RegExp(`^Too many requests\\. Try again in ${wait} seconds?\\.$`));
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-expose-headers']).toContain('Retry-After');
  });

  it('counts each partner key separately: one key running out leaves another untouched', async () => {
    process.env.RATE_LIMIT_PARTNER = '2';
    await get(); await get();
    expect((await get()).status).toBe(429);
    expect((await get(OTHER_PARTNER_KEY)).status).toBe(200);
  });

  it('counts every kind of request from a partner key, not only reads', async () => {
    process.env.RATE_LIMIT_PARTNER = '2';
    await request(app.server).get('/api/bookings/bkg_6001').set('X-API-Key', PARTNER_KEY);
    await request(app.server).delete('/api/bookings/bkg_9999').set('X-API-Key', PARTNER_KEY);
    const refused = await request(app.server).post('/api/bookings').set('X-API-Key', PARTNER_KEY).send({});
    expect(refused.status).toBe(429);
  });

  it('refuses before anything else is looked at: a refused request is not validated or changed', async () => {
    process.env.RATE_LIMIT_PARTNER = '1';
    await get();
    const refused = await request(app.server).post('/api/bookings').set('X-API-Key', PARTNER_KEY).set('Content-Type', 'application/json').send('{not json');
    expect(refused.status).toBe(429); // not 400
  });

  it('counts wrong or made-up keys against the caller\'s address, so rotating fake keys gains nothing', async () => {
    process.env.RATE_LIMIT_ANON = '3';
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await get(`made-up-key-${i}`)).status);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
  });

  it('keeps a valid key working when the address\'s anonymous allowance is used up', async () => {
    process.env.RATE_LIMIT_ANON = '2';
    for (let i = 0; i < 4; i++) await request(app.server).get('/api/courses');
    expect((await request(app.server).get('/api/courses')).status).toBe(429);
    expect((await get()).status).toBe(200);
  });

  it('slows password guessing: login attempts are limited per address, even with the right password later', async () => {
    process.env.RATE_LIMIT_LOGIN = '3';
    const attempt = (password: string) => request(app.server).post('/api/auth/login').send({ email: 'achieng.otieno@example.com', password });
    expect([(await attempt('guess1')).status, (await attempt('guess2')).status, (await attempt('guess3')).status]).toEqual([401, 401, 401]);
    const blocked = await attempt(DEMO_PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  });

  it('counts sign-up attempts in the same allowance as sign-in attempts', async () => {
    process.env.RATE_LIMIT_LOGIN = '2';
    await request(app.server).post('/api/auth/login').send({});
    await request(app.server).post('/api/auth/register').send({});
    expect((await request(app.server).post('/api/auth/register').send({})).status).toBe(429);
  });

  it('does not count ordinary reads against the sign-in allowance', async () => {
    process.env.RATE_LIMIT_LOGIN = '1';
    for (let i = 0; i < 5; i++) await request(app.server).get('/api/me');
    expect((await request(app.server).post('/api/auth/login').send({})).status).toBe(400);
  });

  it('opens a fresh window when the old one ends', async () => {
    process.env.RATE_LIMIT_PARTNER = '1';
    process.env.RATE_LIMIT_WINDOW_MS = '300';
    await get();
    expect((await get()).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect((await get()).status).toBe(200);
  });

  it('never counts or refuses a CORS preflight', async () => {
    process.env.RATE_LIMIT_ANON = '1';
    for (let i = 0; i < 4; i++) expect((await request(app.server).options('/api/courses')).status).toBe(204);
  });

  it('counts each address separately behind a trusted proxy, using the last X-Forwarded-For entry', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.RATE_LIMIT_ANON = '1';
    const from = (address: string, forged = 'spoofed') =>
      request(app.server).get('/api/courses').set('X-Forwarded-For', `${forged}, ${address}`);
    expect((await from('198.51.100.1')).status).toBe(401);
    expect((await from('198.51.100.1', 'another-forgery')).status).toBe(429); // the forged part changes nothing
    expect((await from('198.51.100.2')).status).toBe(401); // a different address has its own allowance
  });

  it('shares one allowance per address when no proxy is trusted, so a forged header gains nothing', async () => {
    delete process.env.TRUST_PROXY;
    process.env.RATE_LIMIT_ANON = '1';
    await request(app.server).get('/api/courses').set('X-Forwarded-For', '198.51.100.1');
    expect((await request(app.server).get('/api/courses').set('X-Forwarded-For', '198.51.100.99')).status).toBe(429);
  });

  it('is applied to the website\'s own calls too, not only to partners', async () => {
    process.env.RATE_LIMIT_ANON = '2';
    for (let i = 0; i < 2; i++) await request(app.server).get('/api/me').set('Authorization', `Bearer ${'ab'.repeat(32)}`);
    expect((await request(app.server).get('/api/me').set('Authorization', `Bearer ${'cd'.repeat(32)}`)).status).toBe(429);
  });

  it('rateLimitRequest can be called directly with a clock', () => {
    process.env.RATE_LIMIT_ANON = '1';
    const headers = new Headers({ 'x-ujuzi-peer': '192.0.2.1' });
    expect(rateLimitRequest('GET', '/api/courses', headers, 0).allowed).toBe(true);
    const refused = rateLimitRequest('GET', '/api/courses', headers, 10_000);
    expect(refused).toEqual({ allowed: false, retryAfter: 50, remaining: 0 });
  });
});
