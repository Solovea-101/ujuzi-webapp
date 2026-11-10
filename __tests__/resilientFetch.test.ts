import { failureReason, fetchWithRetry, MAX_RETRY_AFTER_MS } from '@/lib/clients/resilientFetch';

// The retry rules of Week 11, tested with a pretend fetch and a pretend clock, so nothing here really waits.

type Step = Response | Error | ((signal: AbortSignal) => Promise<Response>);
const original = global.fetch;
let calls: Array<{ method: string }>;
let waits: number[];
const sleep = async (ms: number) => void waits.push(ms);

/** The next steps fetch will take, one per attempt. The last one repeats. */
function script(...steps: Step[]) {
  let index = 0;
  calls = [];
  global.fetch = (async (_url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET' });
    const step = steps[Math.min(index++, steps.length - 1)];
    if (typeof step === 'function') return step(init!.signal!);
    if (step instanceof Error) throw step;
    return step.clone();
  }) as typeof fetch;
}
const reply = (status: number, headers: Record<string, string> = {}) => new Response(status === 204 ? null : '{}', { status, headers });
const refused = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
const config = { timeoutMs: 1500, retries: 2, delayMs: 200, sleep };

beforeEach(() => {
  waits = [];
});
afterEach(() => {
  global.fetch = original;
});

describe('what is retried', () => {
  it('a 503, then a 503, then a 200: two retries, the waits double (200 ms, 400 ms), the caller gets the 200', async () => {
    script(reply(503), reply(503), reply(200));
    const res = await fetchWithRetry('http://partner/x', {}, config);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([200, 400]);
  });

  it.each([500, 502, 503, 504])('retries a %i', async (status) => {
    script(reply(status), reply(200));
    expect((await fetchWithRetry('http://partner/x', {}, config)).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('retries a refused connection and gives the last error back when it never works', async () => {
    script(refused());
    const err = await fetchWithRetry('http://partner/x', {}, config).catch((e) => e);
    expect(failureReason(err)).toBe('ECONNREFUSED');
    expect(calls).toHaveLength(3);
  });

  it('retries a timeout: a slow first attempt is cut off and the second one answers', async () => {
    const hang = (signal: AbortSignal) => new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    script(hang, reply(200));
    const res = await fetchWithRetry('http://partner/x', {}, { ...config, timeoutMs: 40 });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('tells onRetry what happened, in words that never include the address', async () => {
    script(reply(503), reply(200));
    const seen: unknown[] = [];
    await fetchWithRetry('http://partner/x?secret=1', {}, { ...config, onRetry: (info) => seen.push(info) });
    expect(seen).toEqual([{ attempt: 1, attempts: 3, waitMs: 200, reason: 'HTTP 503' }]);
  });
});

describe('what is never retried', () => {
  it.each([400, 401, 403, 404, 409])('a %i comes straight back: asking again changes nothing', async (status) => {
    script(reply(status));
    expect((await fetchWithRetry('http://partner/x', {}, config)).status).toBe(status);
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('a %s is tried once, even when it fails: a retry might do it twice', async (method) => {
    script(reply(503));
    expect((await fetchWithRetry('http://partner/x', { method }, config)).status).toBe(503);
    expect(calls).toHaveLength(1);
    script(refused());
    await expect(fetchWithRetry('http://partner/x', { method }, config)).rejects.toThrow('fetch failed');
    expect(calls).toHaveLength(1);
  });

  it('stops after the retries it is allowed: a partner that always fails gets exactly three attempts, not a loop', async () => {
    script(reply(500));
    expect((await fetchWithRetry('http://partner/x', {}, config)).status).toBe(500);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([200, 400]);
  });

  it('with retries set to 0 it is one attempt', async () => {
    script(reply(503));
    await fetchWithRetry('http://partner/x', {}, { ...config, retries: 0 });
    expect(calls).toHaveLength(1);
  });
});

describe('429: waits for Retry-After, never more than a person would', () => {
  it('waits the seconds Kazi asked for, then tries again', async () => {
    script(reply(429, { 'Retry-After': '2' }), reply(200));
    expect((await fetchWithRetry('http://partner/x', {}, config)).status).toBe(200);
    expect(waits).toEqual([2000]);
  });

  it(`a Retry-After over ${MAX_RETRY_AFTER_MS / 1000} s is handed back at once: nobody is made to wait that long, and nothing asks early`, async () => {
    script(reply(429, { 'Retry-After': '30' }));
    const res = await fetchWithRetry('http://partner/x', {}, config);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it('a 429 with no Retry-After uses the ordinary short wait', async () => {
    script(reply(429), reply(200));
    await fetchWithRetry('http://partner/x', {}, config);
    expect(waits).toEqual([200]);
  });
});

describe('the whole call has a budget', () => {
  it('does not start a retry it has no time for', async () => {
    script(reply(503));
    const res = await fetchWithRetry('http://partner/x', {}, { ...config, budgetMs: 300 }); // 200 ms wait + a 250 ms attempt does not fit
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(1);
  });

  it('cuts an attempt short at what is left of the budget', async () => {
    const hang = (signal: AbortSignal) => new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    script(hang);
    const started = Date.now();
    await expect(fetchWithRetry('http://partner/x', {}, { ...config, timeoutMs: 5000, budgetMs: 120 })).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('the default numbers fit the arithmetic in RESILIENCE_NOTES.md: 3 x 3000 + 200 + 400 = 9600 ms, inside a 10 s budget', () => {
    expect(3 * 3000 + 200 + 400).toBe(9600);
    expect(9600).toBeLessThan(10_000);
  });
});

describe('failureReason: why a call failed, in a few safe words', () => {
  it('names a timeout, a refused connection, an unknown host, and anything else', () => {
    expect(failureReason(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('timeout');
    expect(failureReason(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe('timeout');
    expect(failureReason(refused())).toBe('ECONNREFUSED');
    expect(failureReason(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }))).toBe('ENOTFOUND');
    expect(failureReason(new Error('boom'))).toBe('network error');
    expect(failureReason(undefined)).toBe('network error');
  });

  it('never repeats text from the error (it could hold an address or a key), only a code', () => {
    expect(failureReason(Object.assign(new Error('secret-key-123'), { cause: { code: 'not a code!' } }))).toBe('network error');
  });
});
