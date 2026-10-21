import request from 'supertest';
import { resetStore } from '@/lib/db';
import { generatePartnerKey, hasValidPartnerKey, hashKey } from '@/lib/auth/partnerKey';
import { OTHER_PARTNER_KEY, partner, PARTNER_KEY, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, inDays } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

const KEYS_BEFORE = process.env.PARTNER_KEYS;
// A request with a valid key really does create or cancel a booking, so each test starts from the seed data.
beforeEach(() => resetStore());
afterEach(() => {
  process.env.PARTNER_KEYS = KEYS_BEFORE;
});

describe('hashKey and generatePartnerKey', () => {
  it('hashes with SHA-256, as 64 lower-case hex characters', () => {
    expect(hashKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('makes a long random key with the ujz_ prefix, and a hash that matches it', () => {
    const { key, hash } = generatePartnerKey();
    expect(key).toMatch(/^ujz_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generatePartnerKey().key).not.toBe(key);
  });
});

describe('hasValidPartnerKey', () => {
  const only = (...keys: string[]) => {
    process.env.PARTNER_KEYS = keys.map(hashKey).join(',');
  };

  it('accepts a key whose hash is configured and nothing else', () => {
    only('right-key');
    expect(hasValidPartnerKey('right-key')).toBe(true);
    expect(hasValidPartnerKey('right-key ')).toBe(false);
    expect(hasValidPartnerKey('Right-key')).toBe(false);
    expect(hasValidPartnerKey('wrong-key')).toBe(false);
    expect(hasValidPartnerKey('')).toBe(false);
    expect(hasValidPartnerKey(null)).toBe(false);
  });

  it('never accepts the stored hash itself as the key', () => {
    only('right-key');
    expect(hasValidPartnerKey(hashKey('right-key'))).toBe(false);
  });

  it('accepts any of several keys, with spaces around the commas', () => {
    process.env.PARTNER_KEYS = ` ${hashKey('one')} , ${hashKey('two')}\n,${hashKey('three').toUpperCase()}`;
    expect(['one', 'two', 'three'].map((k) => hasValidPartnerKey(k))).toEqual([true, true, true]);
    expect(hasValidPartnerKey('four')).toBe(false);
  });

  it('is closed, not open, when no key is configured', () => {
    for (const value of [undefined, '', '   ', ',,']) {
      if (value === undefined) delete process.env.PARTNER_KEYS;
      else process.env.PARTNER_KEYS = value;
      expect(hasValidPartnerKey('anything')).toBe(false);
      expect(hasValidPartnerKey('')).toBe(false);
    }
  });

  it('ignores an entry that is not a hash, and the good ones still work', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.PARTNER_KEYS = `not-a-hash,${hashKey('good')},${'g'.repeat(64)}`;
    expect(hasValidPartnerKey('good')).toBe(true);
    expect(hasValidPartnerKey('not-a-hash')).toBe(false);
    warn.mockRestore();
  });
});

// Every partner operation in openapi.yaml: Endpoints 1 to 7.
const body = { courseId: 'crs_501', crewSize: 6, preferredStart: inDays(30), eventName: 'Key test wedding' };
const change = { crewSize: 8, preferredStart: inDays(31) };
const OPERATIONS: Array<[string, 'get' | 'post' | 'put' | 'delete', string, object | undefined]> = [
  ['GET /api/courses', 'get', '/api/courses', undefined],
  ['GET /api/courses/{courseId}', 'get', '/api/courses/crs_501', undefined],
  ['GET /api/certificates/{certificateNo}', 'get', '/api/certificates/UJZ-2026-00123', undefined],
  ['POST /api/bookings', 'post', '/api/bookings', body],
  ['GET /api/bookings/{bookingId}', 'get', '/api/bookings/bkg_6001', undefined],
  ['PUT /api/bookings/{bookingId}', 'put', '/api/bookings/bkg_6001', change],
  ['DELETE /api/bookings/{bookingId}', 'delete', '/api/bookings/bkg_6001', undefined],
];

// The course and certificate reads also accept a login token (the website's pages), so their 401 says so.
const EITHER = new Set(['GET /api/courses', 'GET /api/courses/{courseId}', 'GET /api/certificates/{certificateNo}']);
const KEY_ONLY_MESSAGE = 'Send your partner key as X-API-Key';
const EITHER_MESSAGE = 'Send your partner key as X-API-Key, or log in and send Authorization: Bearer YOUR_TOKEN';

describe.each(OPERATIONS)('%s', (name, method, path, payload) => {
  const message = EITHER.has(name) ? EITHER_MESSAGE : KEY_ONLY_MESSAGE;
  const send = (headers: Record<string, string>) => {
    const req = request(app.server)[method](path).set(headers);
    return payload ? req.send(payload) : req;
  };

  it('answers 401 { message } without a key', async () => {
    const res = await send({});
    expect(res.status).toBe(401);
    expectErrorBody(res.body, message);
  });

  it.each([
    ['a wrong key', { 'X-API-Key': 'not-our-key' }],
    ['an empty key', { 'X-API-Key': '' }],
    ['a key that is one character off', { 'X-API-Key': `${PARTNER_KEY}x` }],
    ['the key in the wrong header', { Authorization: `Bearer ${PARTNER_KEY}` }],
    ['the key in the wrong header name', { 'X-Api-Token': PARTNER_KEY }],
    ['a very long key', { 'X-API-Key': 'k'.repeat(8000) }],
  ])('answers 401 for %s', async (_case, headers) => {
    const res = await send(headers);
    expect(res.status).toBe(401);
    expectErrorBody(res.body, message);
  });

  it('lets a valid key through, whichever way the header is spelled', async () => {
    for (const header of ['X-API-Key', 'x-api-key', 'X-Api-Key']) {
      const res = await send({ [header]: PARTNER_KEY });
      expect(res.status).not.toBe(401);
    }
  });

  it('lets the second issued key through too: one key per consuming system', async () => {
    expect((await send({ 'X-API-Key': OTHER_PARTNER_KEY })).status).not.toBe(401);
  });
});

describe('what a refused request does', () => {
  it('checks the key before the body: bad JSON without a key is 401, with a key it is 400', async () => {
    const withoutKey = await request(app.server).post('/api/bookings').set('Content-Type', 'application/json').send('{"courseId":');
    expect(withoutKey.status).toBe(401);
    const withKey = await partner(app).post('/api/bookings').set('Content-Type', 'application/json').send('{"courseId":');
    expect(withKey.status).toBe(400);
  });

  it('checks the key before the size: an oversized body without a key is 401, not 413', async () => {
    const res = await request(app.server).post('/api/bookings').send({ ...body, eventName: 'x'.repeat(21_000) });
    expect(res.status).toBe(401);
  });

  it('creates nothing on a POST without a key', async () => {
    const res = await request(app.server).post('/api/bookings').send(body);
    expect(res.status).toBe(401);
    expect((await partner(app).get('/api/bookings/bkg_6003')).status).toBe(404);
  });

  it('changes and cancels nothing on a PUT or DELETE without a key', async () => {
    const before = (await partner(app).get('/api/bookings/bkg_6001')).body;
    expect((await request(app.server).put('/api/bookings/bkg_6001').send(change)).status).toBe(401);
    expect((await request(app.server).delete('/api/bookings/bkg_6001')).status).toBe(401);
    const after = await partner(app).get('/api/bookings/bkg_6001');
    expect(after.status).toBe(200);
    expect(after.body).toEqual(before);
  });
});

describe('keys come and go with PARTNER_KEYS', () => {
  it('revokes a key at once when its hash is removed, and leaves the other key working', async () => {
    expect((await partner(app).get('/api/courses')).status).toBe(200);
    process.env.PARTNER_KEYS = hashKey(OTHER_PARTNER_KEY);
    expect((await partner(app).get('/api/courses')).status).toBe(401);
    expect((await request(app.server).get('/api/courses').set('X-API-Key', OTHER_PARTNER_KEY)).status).toBe(200);
  });

  it('answers 401 to everyone when no key is configured', async () => {
    process.env.PARTNER_KEYS = '';
    expect((await partner(app).get('/api/courses')).status).toBe(401);
  });
});

describe('what needs no key', () => {
  it('answers a CORS preflight, and allows the X-API-Key header', async () => {
    const res = await request(app.server).options('/api/bookings').set('Origin', 'https://sherehe.example').set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('X-API-Key');
  });

  it('answers an unknown path with its own 404, not a 401', async () => {
    const res = await request(app.server).get('/api/nothing-here');
    expect(res.status).toBe(404);
  });
});
