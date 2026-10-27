import { api, formatWhen, getToken, kes, localInputToUtc, setToken } from '@/lib/clientApi';

// The browser's storage, in memory: these helpers only touch window.localStorage inside their functions.
function installWindow(blocked = false) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => { if (blocked) throw new Error('blocked'); return store.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (blocked) throw new Error('blocked'); store.set(k, v); },
    removeItem: (k: string) => { if (blocked) throw new Error('blocked'); store.delete(k); },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
}
const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  delete (globalThis as { window?: unknown }).window;
});

const respond = (status: number, body?: unknown) =>
  (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as typeof fetch;

describe('the login token', () => {
  it('is stored, read and cleared', () => {
    installWindow();
    expect(getToken()).toBeNull();
    setToken('abc');
    expect(getToken()).toBe('abc');
    setToken(null);
    expect(getToken()).toBeNull();
  });

  it('behaves as logged out, without crashing, when storage is blocked', () => {
    installWindow(true);
    expect(getToken()).toBeNull();
    expect(() => setToken('abc')).not.toThrow();
  });
});

describe('api()', () => {
  it('sends the token as a bearer header and returns the parsed body', async () => {
    installWindow();
    setToken('tok123');
    let seen: Headers | undefined;
    global.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response(JSON.stringify([{ id: 'crs_501' }]), { status: 200 });
    }) as typeof fetch;
    const res = await api<Array<{ id: string }>>('/api/courses');
    expect(res).toEqual({ ok: true, data: [{ id: 'crs_501' }] });
    expect(seen?.get('authorization')).toBe('Bearer tok123');
  });

  it('sends no Authorization header when logged out, and a JSON body with its content type', async () => {
    installWindow();
    let seen: { headers: Headers; body: unknown } | undefined;
    global.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen = { headers: new Headers(init?.headers), body: init?.body };
      return new Response('{}', { status: 201 });
    }) as typeof fetch;
    await api('/api/auth/login', { method: 'POST', body: { email: 'a@b.co' } });
    expect(seen?.headers.get('authorization')).toBeNull();
    expect(seen?.headers.get('content-type')).toBe('application/json');
    expect(seen?.body).toBe('{"email":"a@b.co"}');
  });

  it('answers ok with no data for a 204', async () => {
    installWindow();
    global.fetch = respond(204);
    expect(await api('/api/auth/logout', { method: 'POST' })).toEqual({ ok: true, data: undefined });
  });

  it('turns an error body into its message, and keeps the status', async () => {
    installWindow();
    global.fetch = respond(409, { message: 'You are already enrolled in course crs_503' });
    expect(await api('/api/enrolments', { method: 'POST', body: {} })).toEqual({ ok: false, status: 409, message: 'You are already enrolled in course crs_503' });
  });

  it('gives a plain message for an error with no body, and for a body that is not JSON', async () => {
    installWindow();
    global.fetch = respond(500);
    expect(await api('/api/x')).toMatchObject({ ok: false, status: 500, message: 'Something went wrong (500)' });
    global.fetch = (async () => new Response('<html>', { status: 502 })) as typeof fetch;
    expect(await api('/api/x')).toMatchObject({ ok: false, status: 502 });
  });

  it('never throws when the network is down: it says so', async () => {
    installWindow();
    global.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    const res = await api('/api/x');
    expect(res).toMatchObject({ ok: false, status: 0 });
    expect((res as { message: string }).message).toMatch(/Could not reach the server/);
  });
});

describe('dates and money', () => {
  it('turns a datetime-local value into UTC with a Z and no milliseconds', () => {
    const utc = localInputToUtc('2031-05-04T11:30');
    expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
    expect(new Date(utc).getTime()).toBe(new Date('2031-05-04T11:30').getTime()); // the same moment
  });

  it('gives an empty string for a value that is not a date', () => {
    expect(localInputToUtc('')).toBe('');
    expect(localInputToUtc('soon')).toBe('');
  });

  it('formats a date for people and leaves an unreadable one as it is', () => {
    expect(formatWhen('2026-11-23T07:00:00Z')).toMatch(/2026/);
    expect(formatWhen('not a date')).toBe('not a date');
  });

  it('writes shillings with thousands separators', () => {
    expect(kes(3500)).toBe('KES 3,500');
    expect(kes(0)).toBe('KES 0');
  });
});
