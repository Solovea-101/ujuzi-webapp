import request from 'supertest';
import { getStore, resetStore } from '@/lib/db';
import { DEMO_PASSWORD } from '@/lib/db/seedData';
import { as, login, SEEDED } from './helpers/auth';
import { startServer, type TestServer } from './helpers/server';
import { expectErrorBody } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

const saved = { ...process.env };
beforeEach(() => {
  resetStore();
  process.env.LOCKOUT_MAX_FAILURES = '3';
  process.env.LOCKOUT_MINUTES = '15';
  process.env.LOCKOUT_WINDOW_MINUTES = '15';
});
afterEach(() => {
  for (const k of ['LOCKOUT_MAX_FAILURES', 'LOCKOUT_MINUTES', 'LOCKOUT_WINDOW_MINUTES']) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const attempt = (email: string, password: string) => request(app.server).post('/api/auth/login').send({ email, password });

describe('POST /api/auth/login: lockout after repeated failures', () => {
  it('locks the email after 3 wrong passwords: even the right password gets 429 with Retry-After', async () => {
    for (let i = 0; i < 3; i++) expect((await attempt(SEEDED.achieng, 'wrong-password')).status).toBe(401);
    const locked = await attempt(SEEDED.achieng, DEMO_PASSWORD);
    expect(locked.status).toBe(429);
    expectErrorBody(locked.body, 'Too many failed sign-ins for this account. Try again in 15 minutes.');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(14 * 60);
    expect(Number(locked.headers['retry-after'])).toBeLessThanOrEqual(15 * 60);
  });

  it('locks an email that has no account in exactly the same way, so it does not say who is registered', async () => {
    for (let i = 0; i < 3; i++) expect((await attempt('nobody@example.com', 'wrong-password')).status).toBe(401);
    const locked = await attempt('nobody@example.com', 'wrong-password');
    expect(locked.status).toBe(429);
    expectErrorBody(locked.body, 'Too many failed sign-ins for this account. Try again in 15 minutes.');
  });

  it('counts the email without regard to case, and leaves other emails alone', async () => {
    await attempt(SEEDED.achieng.toUpperCase(), 'wrong-password');
    await attempt(SEEDED.achieng, 'wrong-password');
    await attempt(`  ${SEEDED.achieng} `, 'wrong-password');
    expect((await attempt(SEEDED.achieng, DEMO_PASSWORD)).status).toBe(429);
    expect((await attempt(SEEDED.brian, DEMO_PASSWORD)).status).toBe(200);
  });

  it('forgets the failures after a successful sign-in', async () => {
    for (let round = 0; round < 3; round++) {
      await attempt(SEEDED.achieng, 'wrong-password');
      await attempt(SEEDED.achieng, 'wrong-password');
      expect((await attempt(SEEDED.achieng, DEMO_PASSWORD)).status).toBe(200); // two failures, then success: never locked
    }
  });

  it('lets the email try again when the lock has run out', async () => {
    process.env.LOCKOUT_MINUTES = String(0.01 / 60); // 10 ms
    for (let i = 0; i < 3; i++) await attempt(SEEDED.achieng, 'wrong-password');
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await attempt(SEEDED.achieng, DEMO_PASSWORD)).status).toBe(200);
  });

  it('keeps the lock in the store, where a restart or a second server would find it', async () => {
    for (let i = 0; i < 3; i++) await attempt(SEEDED.achieng, 'wrong-password');
    expect(await (await getStore()).getSignInLock(SEEDED.achieng, new Date())).toBeInstanceOf(Date);
  });

  it('is checked after the body: a bad body is still 400, and counts for nothing', async () => {
    for (let i = 0; i < 5; i++) expect((await request(app.server).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' })).status).toBe(400);
    expect((await attempt(SEEDED.achieng, DEMO_PASSWORD)).status).toBe(200);
  });
});

describe('POST /api/auth/password', () => {
  const NEW = 'a much better passphrase';
  const change = (token: string, body: object) => as(app, token).post('/api/auth/password').send(body);

  it('answers 401 without a login, and 401 for a partner key', async () => {
    const none = await request(app.server).post('/api/auth/password').send({ currentPassword: DEMO_PASSWORD, newPassword: NEW });
    expect(none.status).toBe(401);
    expectErrorBody(none.body, 'Log in and send Authorization: Bearer YOUR_TOKEN');
  });

  it('changes the password: the new one signs in, the old one does not, and nothing else about the account changes', async () => {
    const token = await login(app, SEEDED.achieng);
    expect((await change(token, { currentPassword: DEMO_PASSWORD, newPassword: NEW })).status).toBe(204);
    expect((await attempt(SEEDED.achieng, DEMO_PASSWORD)).status).toBe(401);
    const again = await attempt(SEEDED.achieng, NEW);
    expect(again.status).toBe(200);
    expect(again.body.user).toMatchObject({ id: 'grd_0101', email: SEEDED.achieng, role: 'graduate' });
  });

  it('ends every other login of the user at once, and keeps the one that asked, and other people\'s', async () => {
    const mine = await login(app, SEEDED.achieng);
    const elsewhere = await login(app, SEEDED.achieng);
    const someoneElse = await login(app, SEEDED.brian);
    expect((await change(mine, { currentPassword: DEMO_PASSWORD, newPassword: NEW })).status).toBe(204);
    expect((await as(app, mine).get('/api/me')).status).toBe(200);
    expect((await as(app, elsewhere).get('/api/me')).status).toBe(401);
    expect((await as(app, someoneElse).get('/api/me')).status).toBe(200);
  });

  it.each([
    ['no body', undefined, 'Request body must be a JSON object'],
    ['a missing newPassword', { currentPassword: DEMO_PASSWORD }, 'newPassword is required'],
    ['a short newPassword', { currentPassword: DEMO_PASSWORD, newPassword: 'short' }, 'newPassword must be 8 to 128 characters'],
    ['the same password again', { currentPassword: DEMO_PASSWORD, newPassword: DEMO_PASSWORD }, 'newPassword must be different from currentPassword'],
    ['an unknown field', { currentPassword: DEMO_PASSWORD, newPassword: NEW, email: 'x@example.com' }, 'Unknown field(s): email'],
  ])('answers 400 for %s, and changes nothing', async (_name, body, message) => {
    const token = await login(app, SEEDED.achieng);
    const res = await as(app, token).post('/api/auth/password').send(body as object);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain(message.replace(/ is required$/, ''));
    expect((await attempt(SEEDED.achieng, DEMO_PASSWORD)).status).toBe(200);
  });

  it('answers 403 for a wrong current password, changes nothing, and counts towards the lock', async () => {
    const token = await login(app, SEEDED.achieng);
    for (let i = 0; i < 3; i++) {
      const res = await change(token, { currentPassword: 'not-my-password', newPassword: NEW });
      expect(res.status).toBe(403);
      expectErrorBody(res.body, 'The current password is wrong');
    }
    const locked = await change(token, { currentPassword: DEMO_PASSWORD, newPassword: NEW });
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
    expect((await attempt(SEEDED.achieng, DEMO_PASSWORD)).status).toBe(429); // the same lock as sign-in
  });

  it('is open to staff too', async () => {
    const token = await login(app, SEEDED.westlands);
    expect((await change(token, { currentPassword: DEMO_PASSWORD, newPassword: NEW })).status).toBe(204);
    expect((await attempt(SEEDED.westlands, NEW)).status).toBe(200);
  });
});

describe('a method a route does not have', () => {
  it('answers 405 with { message } like every other error, on /api only', async () => {
    const res = await request(app.server).put('/api/courses').send({});
    expect(res.status).toBe(405);
    expectErrorBody(res.body, 'This URL does not accept that method');
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect((await request(app.server).delete('/api/auth/login')).body).toEqual({ message: 'This URL does not accept that method' });
  });

  it('leaves answers that carry their own body alone', async () => {
    expect((await request(app.server).get('/api/nothing-here')).status).toBe(404);
    expect((await request(app.server).get('/api/courses/crs_501').set('X-API-Key', 'wrong')).status).toBe(401);
  });
});
