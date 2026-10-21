import type { NextRequest } from 'next/server';
import { NextRequest as Request } from 'next/server';
import { bearerToken, hashToken, SESSION_DAYS, startSession, userForToken } from '@/lib/auth/session';
import { MemoryStore } from '@/lib/db/memoryStore';
import { hashPassword } from '@/lib/auth/passwords';

const withHeader = (value?: string): NextRequest =>
  new Request('http://localhost/api/me', { headers: value === undefined ? {} : { authorization: value } });

const TOKEN = 'ab'.repeat(32);

describe('hashToken', () => {
  const before = process.env.SESSION_SECRET;
  afterEach(() => {
    if (before === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = before;
  });

  it('is a stable 64-character hex digest that is not the token', () => {
    expect(hashToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(TOKEN)).toBe(hashToken(TOKEN));
    expect(hashToken(TOKEN)).not.toBe(TOKEN);
    expect(hashToken(TOKEN)).not.toBe(hashToken('cd'.repeat(32)));
  });

  it('depends on SESSION_SECRET, so a copy of the database alone cannot log anyone in', () => {
    process.env.SESSION_SECRET = 'first secret';
    const first = hashToken(TOKEN);
    process.env.SESSION_SECRET = 'second secret';
    expect(hashToken(TOKEN)).not.toBe(first);
  });
});

describe('bearerToken', () => {
  it.each([
    ['a token', `Bearer ${TOKEN}`, TOKEN],
    ['the scheme in any case', `bearer ${TOKEN}`, TOKEN],
  ])('reads %s', (_name, header, expected) => {
    expect(bearerToken(withHeader(header))).toBe(expected);
  });

  it.each([
    ['no header', undefined],
    ['another scheme', `Basic ${TOKEN}`],
    ['no scheme', TOKEN],
    ['an empty token', 'Bearer '],
    ['a token that is too short', 'Bearer abc123'],
    ['a token that is too long', `Bearer ${TOKEN}0`],
    ['a token with upper-case or odd characters', `Bearer ${'AB'.repeat(32)}`],
    ['two tokens', `Bearer ${TOKEN} ${TOKEN}`],
  ])('ignores %s', (_name, header) => {
    expect(bearerToken(withHeader(header))).toBeUndefined();
  });
});

describe('startSession and userForToken', () => {
  async function storeWithUser() {
    const store = new MemoryStore();
    const user = await store.createUser({
      role: 'graduate', email: 'a@example.com', password_hash: await hashPassword('x'), first_name: 'A', last_name: 'B', centre_id: null,
    });
    return { store, user };
  }

  it('hands out a 64-hex token once, saves only its hash, and expires in 7 days', async () => {
    const { store, user } = await storeWithUser();
    const { token, expiresAt } = await startSession(store, user.id);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.getSession(token)).toBeUndefined(); // the token itself is not what is stored
    expect((await store.getSession(hashToken(token)))?.user_id).toBe(user.id);
    expect(SESSION_DAYS).toBe(7);
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    expect(expiresAt.getMilliseconds()).toBe(0);
  });

  it('gives every login its own token', async () => {
    const { store, user } = await storeWithUser();
    const a = await startSession(store, user.id);
    const b = await startSession(store, user.id);
    expect(a.token).not.toBe(b.token);
    expect((await userForToken(store, a.token))?.id).toBe(user.id);
    expect((await userForToken(store, b.token))?.id).toBe(user.id);
  });

  it('knows nobody for an unknown or malformed token', async () => {
    const { store } = await storeWithUser();
    expect(await userForToken(store, TOKEN)).toBeUndefined();
    expect(await userForToken(store, 'not-a-token')).toBeUndefined();
    expect(await userForToken(store, '')).toBeUndefined();
  });

  it('forgets an expired session as it finds it', async () => {
    const { store, user } = await storeWithUser();
    await store.createSession({ token_hash: hashToken(TOKEN), user_id: user.id, expires_at: new Date(Date.now() - 1000) });
    expect(await userForToken(store, TOKEN)).toBeUndefined();
    expect(await store.getSession(hashToken(TOKEN))).toBeUndefined();
  });
});
