import { isKaziRejected, isKaziUnavailable, KaziRejectedError, KaziUnavailableError } from '@/lib/clients/fetcher';
import {
  createApplication, deleteApplication, getApplicationStatus, listActiveJobs, parseStatusMessage, subscribeUrl, updateApplication,
} from '@/lib/clients/kaziClient';
import { backoffDelay } from '@/lib/realtime/kaziSubscriber';
import { eventually, useKaziStub } from './helpers/kazi';
import { inDays } from './helpers/shapes';

const kazi = useKaziStub();
const input = (over: Record<string, unknown> = {}) => ({ jobId: 'job_12345', studentId: 'grd_0101', preferredDate: inDays(30), ...over });

describe('listActiveJobs', () => {
  it('asks Kazi for active jobs and returns them', async () => {
    const jobs = await listActiveJobs();
    expect(kazi.stub.requests).toEqual(['GET /api/jobs?status=active']);
    expect(jobs.map((j) => j.id)).toEqual(['job_12345', 'job_12346', 'job_12347', 'job_12348', 'job_12350']); // not the closed one
  });

  it('passes the county and category to Kazi, which matches them ignoring case', async () => {
    const jobs = await listActiveJobs({ county: 'nairobi', category: 'Catering' });
    expect(kazi.stub.requests).toEqual(['GET /api/jobs?status=active&county=nairobi&category=Catering']);
    expect(jobs.map((j) => j.id)).toEqual(['job_12345', 'job_12346']);
  });

  it('answers [] when nothing matches', async () => {
    expect(await listActiveJobs({ county: 'Mombasa' })).toEqual([]);
  });

  it('remembers an answer for 5 minutes: the second call does not reach Kazi', async () => {
    await listActiveJobs({ county: 'Nairobi' });
    await listActiveJobs({ county: 'Nairobi' });
    expect(kazi.stub.count('GET /api/jobs')).toBe(1);
    await listActiveJobs({ county: 'Kiambu' }); // another question is another entry
    expect(kazi.stub.count('GET /api/jobs')).toBe(2);
  });

  it('asks again once the cache is old', async () => {
    process.env.KAZI_CACHE_MS = '60';
    await listActiveJobs();
    await new Promise((resolve) => setTimeout(resolve, 90));
    await listActiveJobs();
    expect(kazi.stub.count('GET /api/jobs')).toBe(2);
  });

  it('never remembers a failure', async () => {
    await kazi.stub.down();
    await expect(listActiveJobs()).rejects.toBeInstanceOf(KaziUnavailableError);
    await kazi.stub.up();
    expect((await listActiveJobs()).length).toBeGreaterThan(0);
  });

  it('does not trust what Kazi sends: a job with missing or wrong fields is dropped', async () => {
    kazi.stub.jobs.push({ id: 'job_bad', title: 5 } as never, { ...kazi.stub.jobs[0], id: 'job_bad2', payRange: { min: 'a', max: 1 } } as never);
    const ids = (await listActiveJobs()).map((j) => j.id);
    expect(ids).not.toContain('job_bad');
    expect(ids).not.toContain('job_bad2');
    kazi.stub.jobs.length -= 2;
  });

  it('is unavailable, not a crash, when Kazi answers something that is not a list', async () => {
    const original = fetch;
    global.fetch = (async () => new Response('{"jobs":[]}', { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    try {
      await expect(listActiveJobs()).rejects.toBeInstanceOf(KaziUnavailableError);
    } finally {
      global.fetch = original;
    }
  });

  it('is unavailable when Kazi refuses the list with a 400', async () => {
    await expect(listActiveJobs({ county: '', category: 'catering' })).resolves.toBeDefined(); // an empty filter is simply left out
    expect(kazi.stub.requests.at(-1)).toBe('GET /api/jobs?status=active&category=catering');
  });
});

describe('failures are sorted into our own kinds', () => {
  it('Kazi down (connection refused) is unavailable', async () => {
    await kazi.stub.down();
    const err = await listActiveJobs().catch((e) => e);
    expect(isKaziUnavailable(err)).toBe(true);
    expect(err.message).toBe('Kazi Connect could not be reached');
  });

  it('Kazi too slow is unavailable after the timeout, not after a minute', async () => {
    process.env.KAZI_USER_TIMEOUT_MS = '150';
    kazi.stub.hang(true);
    const started = Date.now();
    const err = await listActiveJobs().catch((e) => e);
    expect(isKaziUnavailable(err)).toBe(true);
    expect(err.message).toBe('Kazi Connect did not answer in time');
    expect(Date.now() - started).toBeLessThan(1200);
  });

  it('waits longer in the background than for a user: the same slow Kazi fails one and answers the other', async () => {
    const app = await createApplication(input());
    process.env.KAZI_USER_TIMEOUT_MS = '100';
    process.env.KAZI_BACKGROUND_TIMEOUT_MS = '2000';
    kazi.stub.slow(300);
    await expect(listActiveJobs()).rejects.toThrow('did not answer in time'); // a user would not wait
    expect(await getApplicationStatus(app.applicationId)).toBe('pending'); // a poller does
  });

  it('a 5xx from Kazi is unavailable', async () => {
    const original = fetch;
    global.fetch = (async () => new Response('boom', { status: 503 })) as typeof fetch;
    try {
      await expect(listActiveJobs()).rejects.toBeInstanceOf(KaziUnavailableError);
    } finally {
      global.fetch = original;
    }
  });

  it('an answer that is not JSON is unavailable', async () => {
    const original = fetch;
    global.fetch = (async () => new Response('<html>nope</html>', { status: 200 })) as typeof fetch;
    try {
      await expect(listActiveJobs()).rejects.toThrow('not JSON');
    } finally {
      global.fetch = original;
    }
  });

  it('a missing KAZI_API_URL is unavailable, and says why', async () => {
    delete process.env.KAZI_API_URL;
    await expect(listActiveJobs()).rejects.toThrow('KAZI_API_URL is not set');
  });
});

describe('applications', () => {
  it('createApplication sends the student id, saves nothing itself, and returns Kazi\'s application', async () => {
    const app = await createApplication(input({ note: 'After 2pm' }));
    expect(app).toMatchObject({ applicationId: 'app_1005', jobId: 'job_12345', studentId: 'grd_0101', note: 'After 2pm', status: 'pending' });
    expect(kazi.stub.applications.get('app_1005')?.studentId).toBe('grd_0101');
  });

  it('turns Kazi\'s 400 and 409 into KaziRejectedError with Kazi\'s message', async () => {
    const unknown = await createApplication(input({ jobId: 'job_nope' })).catch((e) => e);
    expect(isKaziRejected(unknown)).toBe(true);
    expect(unknown).toMatchObject({ status: 400, kaziMessage: 'Job job_nope does not exist' });
    const closed = await createApplication(input({ jobId: 'job_12349' })).catch((e) => e);
    expect(closed).toMatchObject({ status: 409 });
    expect(closed).toBeInstanceOf(KaziRejectedError);
  });

  it('updateApplication reschedules, and an unknown or decided application is rejected', async () => {
    const app = await createApplication(input());
    const later = inDays(40);
    expect((await updateApplication(app.applicationId, { preferredDate: later })).preferredDate).toBe(later);
    expect(await updateApplication('app_9999', { preferredDate: later }).catch((e) => e)).toMatchObject({ status: 404 });
    kazi.stub.accept(app.applicationId);
    expect(await updateApplication(app.applicationId, { preferredDate: later }).catch((e) => e)).toMatchObject({ status: 409 });
  });

  it('deleteApplication withdraws it, and Kazi then answers 404 for it', async () => {
    const app = await createApplication(input());
    await deleteApplication(app.applicationId);
    expect(await getApplicationStatus(app.applicationId)).toBe('gone');
    expect(await deleteApplication(app.applicationId).catch((e) => e)).toMatchObject({ status: 404 });
  });

  it('getApplicationStatus reads the status Kazi holds', async () => {
    const app = await createApplication(input());
    expect(await getApplicationStatus(app.applicationId)).toBe('pending');
    kazi.stub.accept(app.applicationId);
    expect(await getApplicationStatus(app.applicationId)).toBe('accepted');
  });

  it('encodes an application id that is not a plain word, so it cannot change the path', async () => {
    expect(await getApplicationStatus('../jobs?x=1')).toBe('gone');
    expect(kazi.stub.requests.at(-1)).toBe('GET /api/applications/..%2Fjobs%3Fx%3D1/status');
  });
});

describe('the socket address and its messages', () => {
  it('builds the subscribe address from KAZI_WS_URL', () => {
    process.env.KAZI_WS_URL = 'ws://localhost:4002/';
    expect(subscribeUrl('app_1005')).toBe('ws://localhost:4002/api/applications/app_1005/subscribe');
  });

  it.each([
    ['a status message', '{"applicationId":"app_1","status":"accepted"}', { applicationId: 'app_1', status: 'accepted' }],
    ['the cancelled message', '{"applicationId":"app_1","status":"cancelled"}', { applicationId: 'app_1', status: 'cancelled' }],
    ['an unknown status', '{"applicationId":"app_1","status":"vanished"}', undefined],
    ['no application id', '{"status":"accepted"}', undefined],
    ['text that is not JSON', 'hello', undefined],
    ['a list', '[1,2]', undefined],
  ])('reads %s', (_name, raw, expected) => {
    expect(parseStatusMessage(raw)).toEqual(expected);
  });
});

describe('backoffDelay', () => {
  it('doubles from the base up to the cap, with a little jitter either way', () => {
    process.env.KAZI_BACKOFF_BASE_MS = '1000';
    process.env.KAZI_BACKOFF_MAX_MS = '60000';
    expect([0, 1, 2, 3, 4].map((n) => backoffDelay(n, 0.5))).toEqual([1000, 2000, 4000, 8000, 16000]);
    expect(backoffDelay(10, 0.5)).toBe(60000);
    expect(backoffDelay(0, 0)).toBe(800);
    expect(backoffDelay(0, 1)).toBe(1200);
    expect(backoffDelay(10, 1)).toBe(72000);
  });
});

it('eventually helper fails with the last error when the condition never holds', async () => {
  await expect(eventually(() => { throw new Error('never'); }, 60)).rejects.toThrow('never');
});
