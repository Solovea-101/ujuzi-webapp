import { isKaziRateLimited, isKaziUnavailable } from '@/lib/clients/fetcher';
import { createApplication, deleteApplication, getApplicationStatus, listActiveJobs, updateApplication } from '@/lib/clients/kaziClient';
import { getStore, resetStore } from '@/lib/db';
import { getSubscriber } from '@/lib/realtime/kaziSubscriber';
import { loggedInAs, SEEDED } from './helpers/auth';
import { eventually, useKaziStub } from './helpers/kazi';
import { startServer, type TestServer } from './helpers/server';
import { expectErrorBody, inDays } from './helpers/shapes';

// Kazi Connect can switch API keys on for every endpoint and the WebSocket. Ujuzi sends KAZI_API_KEY when it
// is set, treats a 401 as its own misconfiguration (said once, never retried in a loop) and waits out a 429.

const kazi = useKaziStub();
const KEY = 'kazi-key-for-the-tests-only';
let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());
beforeEach(() => {
  getSubscriber().stopAll();
  resetStore();
});
afterEach(() => jest.restoreAllMocks());

const input = { jobId: 'job_12345', studentId: 'grd_0101', preferredDate: inDays(30) };

describe('the Kazi client and KAZI_API_KEY', () => {
  it('sends no key when none is set, which is what Kazi\'s open endpoints expect', async () => {
    await listActiveJobs();
    expect(kazi.stub.keysSeen).toEqual([undefined]);
  });

  it('sends the key as X-API-Key on every call: reads, create, change, status and withdraw', async () => {
    process.env.KAZI_API_KEY = KEY;
    kazi.stub.requireKey(KEY);
    await listActiveJobs();
    const created = await createApplication(input);
    await updateApplication(created.applicationId, { preferredDate: inDays(31) });
    expect(await getApplicationStatus(created.applicationId)).toBe('pending');
    await deleteApplication(created.applicationId);
    expect(kazi.stub.keysSeen).toHaveLength(5);
    expect(new Set(kazi.stub.keysSeen)).toEqual(new Set([KEY]));
  });

  it('answers a 401 as "unavailable" (our own 502 above it), says why once, and does not loop', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (globalThis as { __ujuziKaziKeyNoted?: number }).__ujuziKaziKeyNoted = undefined;
    process.env.KAZI_API_KEY = 'a-wrong-key';
    kazi.stub.requireKey(KEY);
    for (let i = 0; i < 3; i++) {
      const err = await listActiveJobs({ county: `Nairobi${i}` }).catch((e) => e);
      expect(isKaziUnavailable(err)).toBe(true);
      expect(isKaziRateLimited(err)).toBe(false);
    }
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('KAZI_API_KEY');
    expect(JSON.stringify(error.mock.calls)).not.toContain('a-wrong-key'); // the key is never printed
  });

  it('says so when Kazi wants a key and none is set', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (globalThis as { __ujuziKaziKeyNoted?: number }).__ujuziKaziKeyNoted = undefined;
    kazi.stub.requireKey(KEY);
    await expect(listActiveJobs()).rejects.toMatchObject({ name: 'KaziUnavailableError' });
    expect(String(error.mock.calls[0][0])).toContain('KAZI_API_KEY is not set');
  });

  it('reads Retry-After from a 429', async () => {
    kazi.stub.rateLimit(30); // longer than a person waits, so it is handed back at once (a short one is waited out: see kaziResilience.test.ts)
    const err = await listActiveJobs().catch((e) => e);
    expect(isKaziRateLimited(err)).toBe(true);
    expect(isKaziUnavailable(err)).toBe(true); // answered like any Kazi failure
    expect(err.retryAfterMs).toBe(30_000);
  });
});

describe('what a graduate sees', () => {
  it('a wrong key is our own 502, saves nothing, and does not mention keys', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.KAZI_API_KEY = 'a-wrong-key';
    kazi.stub.requireKey(KEY);
    const res = await (await loggedInAs(app, SEEDED.achieng)).post('/api/me/applications').send({ jobId: 'job_12345', preferredDate: inDays(30) });
    expect(res.status).toBe(502);
    expectErrorBody(res.body, 'Kazi Connect could not be reached. Try again in a minute.');
    expect((await (await getStore()).listKaziApplications('grd_0101'))).toEqual([]);
  });

  it('works end to end with the right key, including the live status socket', async () => {
    process.env.KAZI_API_KEY = KEY;
    kazi.stub.requireKey(KEY);
    const graduate = await loggedInAs(app, SEEDED.achieng);
    const res = await graduate.post('/api/me/applications').send({ jobId: 'job_12345', preferredDate: inDays(30) });
    expect(res.status).toBe(201);
    const id = res.body.applicationId as string;
    await eventually(() => expect(getSubscriber().state(id)).toBe('connected'));
    kazi.stub.accept(id);
    await eventually(async () => expect((await (await getStore()).getKaziApplication(id))?.status).toBe('accepted'));
    expect(new Set(kazi.stub.keysSeen)).toEqual(new Set([KEY])); // HTTP and the upgrade both carried it
  });
});

describe('the status socket when Kazi refuses it', () => {
  async function following() {
    process.env.KAZI_API_KEY = KEY;
    kazi.stub.requireKey(KEY);
    const res = await (await loggedInAs(app, SEEDED.achieng)).post('/api/me/applications').send({ jobId: 'job_12345', preferredDate: inDays(30) });
    const id = res.body.applicationId as string;
    await eventually(() => expect(getSubscriber().state(id)).toBe('connected'));
    return id;
  }

  it('waits out a 429 instead of hammering Kazi, then reconnects and learns what it missed', async () => {
    const id = await following();
    kazi.stub.rateLimit(1);
    const before = kazi.stub.keysSeen.length;
    kazi.stub.dropSockets();
    await new Promise((resolve) => setTimeout(resolve, 700));
    // With a 30 ms backoff it would have tried a dozen times by now; Retry-After: 1 holds it to one or two.
    expect(kazi.stub.keysSeen.length - before).toBeLessThanOrEqual(3);
    kazi.stub.rateLimit(0);
    kazi.stub.setStatus(id, 'accepted'); // happens while we cannot listen
    await eventually(async () => expect((await (await getStore()).getKaziApplication(id))?.status).toBe('accepted'), 4000);
  }, 10_000);

  it('says once that the key is refused, and keeps trying slowly, not in a loop', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (globalThis as { __ujuziKaziKeyNoted?: number }).__ujuziKaziKeyNoted = undefined;
    const id = await following();
    kazi.stub.requireKey('a-different-key-now');
    kazi.stub.dropSockets();
    await eventually(() => expect(error).toHaveBeenCalled());
    kazi.stub.requireKey(KEY); // the operator fixes it
    await eventually(() => expect(getSubscriber().state(id)).toBe('connected'), 4000);
    expect(error.mock.calls.filter((call) => String(call[0]).includes('KAZI_API_KEY'))).toHaveLength(1);
  }, 10_000);
});
