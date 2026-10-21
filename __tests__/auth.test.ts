import request from 'supertest';
import { hashToken } from '@/lib/auth/session';
import { getStore, resetStore } from '@/lib/db';
import { DEMO_PASSWORD } from '@/lib/db/seedData';
import { as, login, SEEDED } from './helpers/auth';
import { partner, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys, inDays, ISO_SECONDS } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());
beforeEach(() => resetStore());

const INVITE_BEFORE = process.env.STAFF_INVITE_CODE;
afterEach(() => {
  if (INVITE_BEFORE === undefined) delete process.env.STAFF_INVITE_CODE;
  else process.env.STAFF_INVITE_CODE = INVITE_BEFORE;
});

const PASSWORD = 'a long passphrase';
const newGraduate = (over: Record<string, unknown> = {}) => ({
  role: 'graduate', email: 'wanjiku.kariuki@example.com', password: PASSWORD, firstName: 'Wanjiku', lastName: 'Kariuki', ...over,
});
const newStaff = (over: Record<string, unknown> = {}) => ({ ...newGraduate({ role: 'staff', email: 'new.staff@example.com' }), centreId: 'cen_11', inviteCode: 'open-sesame', ...over });
const register = (body: unknown) => request(app.server).post('/api/auth/register').send(body as object);
const loginWith = (email: string, password: string) => request(app.server).post('/api/auth/login').send({ email, password });

function expectAuthShape(body: Record<string, unknown>) {
  expectKeys(body, ['token', 'expiresAt', 'user']);
  expectKeys(body.user, ['id', 'role', 'email', 'firstName', 'lastName', 'centreId']);
  expect(body.token).toMatch(/^[0-9a-f]{64}$/);
  expect(body.expiresAt).toMatch(ISO_SECONDS);
}

describe('POST /api/auth/register: a graduate', () => {
  it('creates the account and logs it in: 201 with a token and the user', async () => {
    const res = await register(newGraduate());
    expect(res.status).toBe(201);
    expectAuthShape(res.body);
    expect(res.body.user).toEqual({
      id: 'grd_0104', // the three seeded graduates are grd_0101 to grd_0103
      role: 'graduate',
      email: 'wanjiku.kariuki@example.com',
      firstName: 'Wanjiku',
      lastName: 'Kariuki',
      centreId: null,
    });
    const days = (Date.parse(res.body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('gives a token that works at once', async () => {
    const res = await register(newGraduate());
    const me = await as(app, res.body.token).get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body).toEqual(res.body.user);
  });

  it('never sends the password or its hash back', async () => {
    const res = await register(newGraduate());
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toMatch(/scrypt|password/i);
  });

  it('lower-cases and trims the email and trims the names', async () => {
    const res = await register(newGraduate({ email: '  Wanjiku.KARIUKI@Example.COM ', firstName: '  Wanjiku ', lastName: ' Kariuki  ' }));
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'wanjiku.kariuki@example.com', firstName: 'Wanjiku', lastName: 'Kariuki' });
  });

  it('stores only a hash of the password and only a hash of the token', async () => {
    const res = await register(newGraduate());
    const store = await getStore();
    const user = await store.getUserByEmail('wanjiku.kariuki@example.com');
    expect(user?.password_hash).toMatch(/^scrypt\$/);
    expect(user?.password_hash).not.toContain(PASSWORD);
    expect(await store.getSession(res.body.token)).toBeUndefined(); // the token itself is not what is saved
    expect((await store.getSession(hashToken(res.body.token)))?.user_id).toBe('grd_0104');
  });

  it('answers 409 for an email that already has an account, in any case, and creates nothing', async () => {
    for (const email of [SEEDED.achieng, SEEDED.achieng.toUpperCase(), ` ${SEEDED.achieng} `]) {
      const res = await register(newGraduate({ email }));
      expect(res.status).toBe(409);
      expectErrorBody(res.body, `An account with the email ${SEEDED.achieng} already exists`);
    }
    await register(newGraduate());
    expect((await register(newGraduate())).status).toBe(409);
  });

  it.each([
    ['no body at all', undefined, 'Request body must be a JSON object'],
    ['an empty object', {}, 'Missing required field(s): role, email, password, firstName, lastName'],
    ['an unknown field', newGraduate({ admin: true }), 'Unknown field(s): admin'],
    ['an unknown role', newGraduate({ role: 'admin' }), 'role must be graduate or staff'],
    ['an email with no @', newGraduate({ email: 'nobody.example.com' }), /^email must be an email address/],
    ['an email with a space', newGraduate({ email: 'no body@example.com' }), /^email must be an email address/],
    ['an email over 254 characters', newGraduate({ email: `${'a'.repeat(250)}@example.com` }), /^email must be an email address/],
    ['a password of 7 characters', newGraduate({ password: '1234567' }), 'password must be 8 to 128 characters'],
    ['a password of 129 characters', newGraduate({ password: 'x'.repeat(129) }), 'password must be 8 to 128 characters'],
    ['a password that is a number', newGraduate({ password: 12345678 }), 'password must be 8 to 128 characters'],
    ['an empty first name', newGraduate({ firstName: '  ' }), 'firstName must be 1 to 60 characters'],
    ['a last name of 61 characters', newGraduate({ lastName: 'x'.repeat(61) }), 'lastName must be 1 to 60 characters'],
    ['a graduate with a centreId', newGraduate({ centreId: 'cen_11' }), 'centreId and inviteCode are only for staff accounts'],
    ['a graduate with an inviteCode', newGraduate({ inviteCode: 'x' }), 'centreId and inviteCode are only for staff accounts'],
  ])('answers 400 { message } and creates nothing for %s', async (_name, body, message) => {
    const res = body === undefined ? await request(app.server).post('/api/auth/register') : await register(body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
    expect(await (await getStore()).getUserByEmail('wanjiku.kariuki@example.com')).toBeUndefined();
  });

  it('answers 400 for malformed JSON and 413 for an oversized body', async () => {
    expect((await request(app.server).post('/api/auth/register').set('Content-Type', 'application/json').send('{"role":')).status).toBe(400);
    const big = await register(newGraduate({ firstName: 'x'.repeat(21_000) }));
    expect(big.status).toBe(413);
    expectErrorBody(big.body, 'Request body must be 20 KB or less');
  });

  it('needs no partner key and no token', async () => {
    expect((await register(newGraduate())).status).toBe(201);
  });
});

describe('POST /api/auth/register: staff', () => {
  it('is closed when no invite code is configured: 403, and nothing is created', async () => {
    delete process.env.STAFF_INVITE_CODE;
    const res = await register(newStaff());
    expect(res.status).toBe(403);
    expectErrorBody(res.body, 'Staff sign-up is closed on this deployment');
    expect(await (await getStore()).getUserByEmail('new.staff@example.com')).toBeUndefined();
  });

  it('stays closed when the invite code is configured as an empty string', async () => {
    process.env.STAFF_INVITE_CODE = '';
    expect((await register(newStaff({ inviteCode: '' }))).status).toBe(400);
    expect((await register(newStaff())).status).toBe(403);
  });

  it('refuses a wrong invite code with 403, and creates nothing', async () => {
    process.env.STAFF_INVITE_CODE = 'open-sesame';
    for (const inviteCode of ['OPEN-SESAME', 'open', 'open-sesame-', 'x'.repeat(200)]) {
      const res = await register(newStaff({ inviteCode }));
      expect(res.status).toBe(403);
      expectErrorBody(res.body, 'That invite code is not valid');
    }
    expect(await (await getStore()).getUserByEmail('new.staff@example.com')).toBeUndefined();
  });

  it('ignores spaces around a correct invite code, as when it was pasted', async () => {
    process.env.STAFF_INVITE_CODE = 'open-sesame';
    expect((await register(newStaff({ inviteCode: '  open-sesame ' }))).status).toBe(201);
  });

  it('creates a staff account at the centre with the right invite code, and the token has staff powers', async () => {
    process.env.STAFF_INVITE_CODE = 'open-sesame';
    const res = await register(newStaff());
    expect(res.status).toBe(201);
    expectAuthShape(res.body);
    expect(res.body.user).toMatchObject({ id: 'usr_0006', role: 'staff', centreId: 'cen_11' }); // five staff are seeded
    const bookings = await as(app, res.body.token).get('/api/bookings');
    expect(bookings.status).toBe(200);
    expect(bookings.body.map((b: { id: string }) => b.id)).toEqual(['bkg_6001', 'bkg_6002']);
  });

  it('answers 400 for a centre that does not exist, and for a missing centreId or inviteCode', async () => {
    process.env.STAFF_INVITE_CODE = 'open-sesame';
    const noCentre = await register(newStaff({ centreId: 'cen_99' }));
    expect(noCentre.status).toBe(400);
    expectErrorBody(noCentre.body, 'centreId cen_99 does not match any centre');
    const { centreId, ...withoutCentre } = newStaff();
    void centreId;
    const missing = await register(withoutCentre);
    expect(missing.status).toBe(400);
    expectErrorBody(missing.body, 'Missing required field(s): centreId');
    const { inviteCode, ...withoutCode } = newStaff();
    void inviteCode;
    expectErrorBody((await register(withoutCode)).body, 'Missing required field(s): inviteCode');
  });
});

describe('POST /api/auth/login', () => {
  it.each(Object.entries(SEEDED))('lets the seeded account %s log in with the demo password', async (_name, email) => {
    const res = await loginWith(email, DEMO_PASSWORD);
    expect(res.status).toBe(200);
    expectAuthShape(res.body);
    expect(res.body.user.email).toBe(email);
  });

  it('returns the right role and centre for graduates and staff', async () => {
    expect((await loginWith(SEEDED.achieng, DEMO_PASSWORD)).body.user).toMatchObject({ id: 'grd_0101', role: 'graduate', centreId: null });
    expect((await loginWith(SEEDED.hurlingham, DEMO_PASSWORD)).body.user).toMatchObject({ id: 'usr_0002', role: 'staff', centreId: 'cen_12' });
  });

  it('accepts the email in any case and with spaces around it', async () => {
    expect((await loginWith(` ${SEEDED.achieng.toUpperCase()} `, DEMO_PASSWORD)).status).toBe(200);
  });

  it('gives every login its own token, and all of them work', async () => {
    const [a, b] = await Promise.all([login(app, SEEDED.achieng), login(app, SEEDED.achieng)]);
    expect(a).not.toBe(b);
    expect((await as(app, a).get('/api/me')).status).toBe(200);
    expect((await as(app, b).get('/api/me')).status).toBe(200);
  });

  it('answers 401 with the same message for a wrong password and for an unknown email', async () => {
    const wrongPassword = await loginWith(SEEDED.achieng, 'not the password');
    const unknownEmail = await loginWith('nobody@example.com', DEMO_PASSWORD);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expectErrorBody(wrongPassword.body, 'Email or password is wrong');
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it.each([
    ['the password in another case', DEMO_PASSWORD.toUpperCase()],
    ['the password with a trailing space', `${DEMO_PASSWORD} `],
    ['an empty-looking password', ' '],
  ])('answers 401 for %s', async (_name, password) => {
    expect((await loginWith(SEEDED.achieng, password)).status).toBe(401);
  });

  it.each([
    ['no body', undefined, 'Request body must be a JSON object'],
    ['an empty object', {}, 'Missing required field(s): email, password'],
    ['an unknown field', { email: SEEDED.achieng, password: 'x', remember: true }, 'Unknown field(s): remember'],
    ['an email that is not one', { email: 'nope', password: 'x' }, /^email must be an email address/],
    ['an empty password', { email: SEEDED.achieng, password: '' }, 'password must be 1 to 128 characters'],
    ['a password of 129 characters', { email: SEEDED.achieng, password: 'x'.repeat(129) }, 'password must be 1 to 128 characters'],
  ])('answers 400 { message } for %s', async (_name, body, message) => {
    const res = body === undefined ? await request(app.server).post('/api/auth/login') : await request(app.server).post('/api/auth/login').send(body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
  });

  it('never sends a password hash back', async () => {
    expect(JSON.stringify((await loginWith(SEEDED.achieng, DEMO_PASSWORD)).body)).not.toMatch(/scrypt|password/i);
  });
});

describe('POST /api/auth/logout', () => {
  it('answers 204 with no body, and the token stops working at once', async () => {
    const token = await login(app, SEEDED.achieng);
    const res = await as(app, token).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await as(app, token).get('/api/me')).status).toBe(401);
  });

  it('ends only that login: the same person\'s other token keeps working', async () => {
    const [phone, laptop] = [await login(app, SEEDED.achieng), await login(app, SEEDED.achieng)];
    await as(app, phone).post('/api/auth/logout');
    expect((await as(app, laptop).get('/api/me')).status).toBe(200);
  });

  it('answers 401 the second time, and without a token', async () => {
    const token = await login(app, SEEDED.achieng);
    await as(app, token).post('/api/auth/logout');
    expect((await as(app, token).post('/api/auth/logout')).status).toBe(401);
    expect((await request(app.server).post('/api/auth/logout')).status).toBe(401);
  });
});

describe('GET /api/me', () => {
  it('returns the logged in user with the contract shape', async () => {
    const res = await as(app, await login(app, SEEDED.westlands)).get('/api/me');
    expect(res.status).toBe(200);
    expectKeys(res.body, ['id', 'role', 'email', 'firstName', 'lastName', 'centreId']);
    expect(res.body).toEqual({
      id: 'usr_0001', role: 'staff', email: SEEDED.westlands, firstName: 'Wanjiru', lastName: 'Njeri', centreId: 'cen_11',
    });
  });

  it.each([
    ['no Authorization header', {}],
    ['another scheme', { Authorization: `Basic ${'ab'.repeat(32)}` }],
    ['a token that is not ours', { Authorization: `Bearer ${'ab'.repeat(32)}` }],
    ['garbage', { Authorization: 'Bearer not-a-token' }],
    ['an empty token', { Authorization: 'Bearer ' }],
    ['a partner key instead of a token', { 'X-API-Key': 'anything' }],
  ])('answers 401 { message } for %s', async (_name, headers) => {
    const res = await request(app.server).get('/api/me').set(headers);
    expect(res.status).toBe(401);
    expectErrorBody(res.body, 'Log in and send Authorization: Bearer YOUR_TOKEN');
  });

  it('answers 401 for an expired token, and forgets it', async () => {
    const store = await getStore();
    const token = 'cd'.repeat(32);
    await store.createSession({ token_hash: hashToken(token), user_id: 'grd_0101', expires_at: new Date(Date.now() - 1000) });
    expect((await as(app, token).get('/api/me')).status).toBe(401);
    expect(await store.getSession(hashToken(token))).toBeUndefined();
  });
});

describe('who may use which kind of credential', () => {
  it('lets a login token read courses and certificates, as the website\'s pages do', async () => {
    const graduate = as(app, await login(app, SEEDED.achieng));
    expect((await graduate.get('/api/courses')).status).toBe(200);
    expect((await graduate.get('/api/courses/crs_501')).status).toBe(200);
    expect((await graduate.get('/api/certificates/UJZ-2026-00123')).status).toBe(200);
  });

  it('refuses a token that is not valid on those reads, with the "key or login" message', async () => {
    const res = await request(app.server).get('/api/courses').set('Authorization', `Bearer ${'ab'.repeat(32)}`);
    expect(res.status).toBe(401);
    expectErrorBody(res.body, 'Send your partner key as X-API-Key, or log in and send Authorization: Bearer YOUR_TOKEN');
  });

  it('does not let a login token use the partner-only booking endpoints', async () => {
    const token = await login(app, SEEDED.westlands);
    const body = { courseId: 'crs_501', crewSize: 6, preferredStart: inDays(30), eventName: 'Token cannot book' };
    const res = await as(app, token).post('/api/bookings').send(body);
    expect(res.status).toBe(401);
    expectErrorBody(res.body, 'Send your partner key as X-API-Key');
    expect((await as(app, token).get('/api/bookings/bkg_6001')).status).toBe(401);
    expect((await as(app, token).delete('/api/bookings/bkg_6001')).status).toBe(401);
  });

  it('does not let a partner key use the staff or graduate endpoints', async () => {
    for (const [method, path] of [['get', '/api/bookings'], ['get', '/api/me'], ['get', '/api/me/enrolments'], ['post', '/api/enrolments'], ['post', '/api/courses'], ['post', '/api/certificates'], ['patch', '/api/bookings/bkg_6001']] as const) {
      const res = await partner(app)[method](path).send({});
      expect([path, res.status]).toEqual([path, 401]);
      expectErrorBody(res.body, 'Log in and send Authorization: Bearer YOUR_TOKEN');
    }
  });
});
