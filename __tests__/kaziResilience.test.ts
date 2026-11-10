import { isKaziRateLimited, isKaziUnavailable } from '@/lib/clients/fetcher';
import { kaziMetrics } from '@/lib/clients/kaziMetrics';
import { createApplication, listActiveJobs, readActiveJobs } from '@/lib/clients/kaziClient';
import { eventually, useKaziStub } from './helpers/kazi';
import { inDays } from './helpers/shapes';

// Week 11 through the whole Kazi client: a real (stub) Kazi that is slow, flaky or gone.

const kazi = useKaziStub();
let warn: jest.SpyInstance;
let error: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const lines = (spy: jest.SpyInstance) => spy.mock.calls.map((call) => String(call[0]));

describe('retries', () => {
  it('a flaky Kazi (503, 503, then fine): the caller never sees a failure, and the log says what happened', async () => {
    kazi.stub.failWith(503, 2);
    const jobs = await listActiveJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(kazi.stub.count('GET /api/jobs')).toBe(3);
    expect(kaziMetrics().retries).toBe(2);
    expect(lines(warn).filter((l) => l.includes('retrying'))).toEqual([
      'kazi GET /api/jobs: attempt 1 of 3 failed (HTTP 503), retrying in 5 ms',
      'kazi GET /api/jobs: attempt 2 of 3 failed (HTTP 503), retrying in 10 ms',
    ]);
  });

  it('a Kazi that always fails (500) gets exactly three attempts, then our "unavailable"', async () => {
    kazi.stub.failWith(500);
    const err = await listActiveJobs().catch((e) => e);
    expect(isKaziUnavailable(err)).toBe(true);
    expect(kazi.stub.count('GET /api/jobs')).toBe(3);
    expect(kaziMetrics()).toMatchObject({ calls: 1, failures: 1, retries: 2, failuresByReason: { 'HTTP 500': 1 } });
  });

  it('a slow moment is survived: the first attempt is cut off at the attempt timeout, the second answers', async () => {
    process.env.KAZI_ATTEMPT_TIMEOUT_MS = '120';
    kazi.stub.slowFor(600, 1);
    expect((await listActiveJobs()).length).toBeGreaterThan(0);
    expect(kazi.stub.count('GET /api/jobs')).toBe(2);
  });

  it('a 404 is not retried', async () => {
    kazi.stub.failWith(404, 1);
    await expect(listActiveJobs()).rejects.toThrow('answered 404');
    expect(kazi.stub.count('GET /api/jobs')).toBe(1);
  });

  it('a write is never retried: a failed application is one request, so it cannot be made twice', async () => {
    kazi.stub.failWith(503);
    const err = await createApplication({ jobId: 'job_12345', studentId: 'grd_0101', preferredDate: inDays(30) }).catch((e) => e);
    expect(isKaziUnavailable(err)).toBe(true);
    expect(kazi.stub.count('POST /api/applications')).toBe(1);
    expect(kaziMetrics().retries).toBe(0);
  });

  it('the whole wait stays inside the user budget, however many attempts that leaves room for', async () => {
    process.env.KAZI_USER_TIMEOUT_MS = '500';
    kazi.stub.hang(true);
    const started = Date.now();
    await expect(listActiveJobs()).rejects.toThrow('did not answer in time');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('a 429 with a long Retry-After is not waited for: it is our own "unavailable" with the wait attached, at once', async () => {
    kazi.stub.rateLimit(30);
    const started = Date.now();
    const err = await listActiveJobs().catch((e) => e);
    expect(isKaziRateLimited(err)).toBe(true);
    expect(err.retryAfterMs).toBe(30_000);
    expect(kazi.stub.count('GET /api/jobs')).toBe(1);
    expect(Date.now() - started).toBeLessThan(500);
    expect(kaziMetrics().rateLimited).toBe(1);
  });
});

describe('the log says why, and never holds a key or a query', () => {
  it('Kazi down: ECONNREFUSED, with the path only', async () => {
    process.env.KAZI_API_KEY = 'a-key-that-must-never-be-printed';
    await kazi.stub.down();
    await expect(listActiveJobs({ county: 'Nairobi', category: 'catering' })).rejects.toBeDefined();
    expect(lines(error)).toEqual(['kazi GET /api/jobs failed: ECONNREFUSED']);
    const everything = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    expect(everything).not.toContain('a-key-that-must-never-be-printed');
    expect(everything).not.toContain('county=');
    expect(everything).not.toContain('127.0.0.1');
    expect(kaziMetrics().failuresByReason).toEqual({ ECONNREFUSED: 1 });
  });

  it('a hostname that does not exist is ENOTFOUND, not just "failed"', async () => {
    process.env.KAZI_API_URL = 'http://kazi-does-not-exist.invalid';
    await expect(listActiveJobs()).rejects.toBeDefined();
    expect(lines(error)[0]).toMatch(/failed: (ENOTFOUND|EAI_AGAIN)$/);
  });

  it('too slow: "timeout"', async () => {
    process.env.KAZI_USER_TIMEOUT_MS = '150';
    kazi.stub.hang(true);
    await expect(listActiveJobs()).rejects.toBeDefined();
    expect(lines(error)).toEqual(['kazi GET /api/jobs failed: timeout']);
  });
});

describe('saved data when Kazi cannot be reached', () => {
  const cacheExpiresQuickly = async () => {
    process.env.KAZI_CACHE_MS = '20';
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  it('serves the last good list, flagged stale and dated, and goes back to live data when Kazi is back', async () => {
    process.env.KAZI_CACHE_MS = '20';
    const live = await readActiveJobs({ county: 'Nairobi' });
    expect(live.stale).toBe(false);
    await cacheExpiresQuickly();

    await kazi.stub.down();
    const saved = await readActiveJobs({ county: 'Nairobi' });
    expect(saved.stale).toBe(true);
    expect(saved.asOf).toBe(live.asOf); // the time Kazi gave it, not now
    expect(saved.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(saved.value).toEqual(live.value);
    expect(kaziMetrics().staleServed).toBe(1);

    await kazi.stub.up(); // no code change, no restart of Ujuzi
    await eventually(async () => {
      const again = await readActiveJobs({ county: 'Nairobi' });
      expect(again.stale).toBe(false);
    });
  });

  it('with nothing saved yet, the failure is shown as a failure (our own "unavailable")', async () => {
    await kazi.stub.down();
    await expect(readActiveJobs({ county: 'Nairobi' })).rejects.toMatchObject({ name: 'KaziUnavailableError' });
    expect(kaziMetrics().staleServed).toBe(0);
  });

  it('a saved copy belongs to its own question: Kiambu is not answered with Nairobi', async () => {
    await readActiveJobs({ county: 'Nairobi' });
    await cacheExpiresQuickly();
    await kazi.stub.down();
    await expect(readActiveJobs({ county: 'Kiambu' })).rejects.toMatchObject({ name: 'KaziUnavailableError' });
  });

  it('a saved copy is not kept for ever (KAZI_STALE_MS)', async () => {
    process.env.KAZI_STALE_MS = '60';
    process.env.KAZI_CACHE_MS = '20';
    await readActiveJobs();
    await new Promise((resolve) => setTimeout(resolve, 120));
    await kazi.stub.down();
    await expect(readActiveJobs()).rejects.toMatchObject({ name: 'KaziUnavailableError' });
  });

  it('a Kazi that is only rate limiting us is covered the same way', async () => {
    process.env.KAZI_CACHE_MS = '20';
    await readActiveJobs();
    await cacheExpiresQuickly();
    kazi.stub.rateLimit(30);
    expect((await readActiveJobs()).stale).toBe(true);
  });

  it('a restart of Ujuzi loses the saved copy: it lives in memory only', async () => {
    await readActiveJobs();
    (globalThis as { __ujuziKaziCache?: Map<string, unknown> }).__ujuziKaziCache = undefined; // what a restart does
    process.env.KAZI_CACHE_MS = '20';
    await kazi.stub.down();
    await expect(readActiveJobs()).rejects.toMatchObject({ name: 'KaziUnavailableError' });
  });
});
