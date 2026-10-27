import request from 'supertest';
import { getStore, resetStore } from '@/lib/db';
import { getSubscriber } from '@/lib/realtime/kaziSubscriber';
import { loggedInAs, SEEDED } from './helpers/auth';
import { useKaziStub } from './helpers/kazi';
import { partner, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys, inDays, ISO_SECONDS } from './helpers/shapes';

const kazi = useKaziStub();
let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());
beforeEach(() => {
  getSubscriber().stopAll();
  resetStore();
});

const LOGIN = 'Log in and send Authorization: Bearer YOUR_TOKEN';
const UNREACHABLE = 'Kazi Connect could not be reached. Try again in a minute.';
const apply = (over: Record<string, unknown> = {}) => ({ jobId: 'job_12345', preferredDate: inDays(30), ...over });
const graduate = (email: string = SEEDED.achieng) => loggedInAs(app, email);

/**
 * An application that Ujuzi is NOT following: for tests where Kazi changes something "behind our back". Left
 * alone, the subscriber hears the change at once (that is its job) and the row is already up to date.
 */
async function appliedUnwatched() {
  const mine = await applied();
  getSubscriber().stopAll();
  return mine;
}

async function applied(email: string = SEEDED.achieng, over: Record<string, unknown> = {}) {
  const res = await (await graduate(email)).post('/api/me/applications').send(apply(over));
  expect(res.status).toBe(201);
  return res.body as { applicationId: string; preferredDate: string; note: string; status: string };
}

function expectApplicationShape(body: Record<string, unknown>) {
  expectKeys(body, ['applicationId', 'jobId', 'preferredDate', 'note', 'status', 'createdAt']);
  expect(body.applicationId).toMatch(/^app_\d+$/);
  expect(body.preferredDate).toMatch(ISO_SECONDS);
  expect(body.createdAt).toMatch(ISO_SECONDS);
  expect(['pending', 'accepted', 'filled', 'cancelled']).toContain(body.status);
}

describe('GET /api/courses/{courseId}/job-matches', () => {
  it('lists the active Kazi jobs in the course\'s category and county, with the contract shape', async () => {
    const res = await (await graduate()).get('/api/courses/crs_501/job-matches');
    expect(res.status).toBe(200);
    expect(res.body.map((j: { jobId: string }) => j.jobId)).toEqual(['job_12345', 'job_12346']);
    for (const job of res.body) {
      expectKeys(job, ['jobId', 'title', 'category', 'county', 'area', 'duration', 'urgent', 'payRange']);
      expectKeys(job.payRange, ['minKes', 'maxKes']);
    }
    expect(res.body[0]).toEqual({
      jobId: 'job_12345', title: 'Event Catering Assistant', category: 'catering', county: 'Nairobi', area: 'Westlands',
      duration: 'Part time, 3 months', urgent: true, payRange: { minKes: 15000, maxKes: 22000 },
    });
    expect(kazi.stub.requests).toEqual(['GET /api/jobs?status=active&county=Nairobi&category=catering']);
  });

  it('shows pay as whole shillings, as the shared money rule says', async () => {
    const res = await (await graduate()).get('/api/courses/crs_501/job-matches');
    expect(res.body[1].payRange).toEqual({ minKes: 9001, maxKes: 14000 }); // Kazi sent 9000.5
    expect(Number.isInteger(res.body[1].payRange.minKes)).toBe(true);
  });

  it('uses the county asked for, in any case, instead of the course\'s own', async () => {
    const res = await (await graduate()).get('/api/courses/crs_505/job-matches?county=kiambu');
    expect(res.body.map((j: { jobId: string }) => j.jobId)).toEqual(['job_12348']);
    expect(kazi.stub.requests[0]).toBe('GET /api/jobs?status=active&county=Kiambu&category=accommodation');
    expect((await (await graduate()).get('/api/courses/crs_501/job-matches?county=Kiambu')).body).toEqual([]);
  });

  it('answers [] with 200 when nothing matches', async () => {
    const res = await (await graduate()).get('/api/courses/crs_509/job-matches'); // tutoring in Mombasa
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('skips a job whose category is not on the shared list, and accepts one spelled with capitals', async () => {
    kazi.stub.jobs.push({ ...kazi.stub.jobs[0], id: 'job_caps', category: 'Catering' });
    const ids = (await (await graduate()).get('/api/courses/crs_501/job-matches')).body.map((j: { jobId: string }) => j.jobId);
    expect(ids).toContain('job_caps');
    expect(ids).not.toContain('job_12350');
  });

  it('asks Kazi once for the same question inside 5 minutes', async () => {
    const g = await graduate();
    await g.get('/api/courses/crs_501/job-matches');
    await g.get('/api/courses/crs_501/job-matches');
    await g.get('/api/courses/crs_502/job-matches'); // events: another question
    expect(kazi.stub.count('GET /api/jobs')).toBe(2);
  });

  it.each([
    ['an unknown county', '?county=Narnia'],
    ['an empty county', '?county='],
    ['a county given twice', '?county=Nairobi&county=Kiambu'],
  ])('answers 400 for %s, without asking Kazi', async (_name, query) => {
    const res = await (await graduate()).get(`/api/courses/crs_501/job-matches${query}`);
    expect(res.status).toBe(400);
    expectErrorBody(res.body);
    expect(kazi.stub.requests).toEqual([]);
  });

  it('answers 404 for an unknown course, 401 without a login, and 401 for a partner key', async () => {
    const missing = await (await graduate()).get('/api/courses/crs_999/job-matches');
    expect(missing.status).toBe(404);
    expectErrorBody(missing.body, 'Course crs_999 not found');
    const none = await request(app.server).get('/api/courses/crs_501/job-matches');
    expect(none.status).toBe(401);
    expectErrorBody(none.body, LOGIN);
    expect((await partner(app).get('/api/courses/crs_501/job-matches')).status).toBe(401);
  });

  it('is open to staff too: any logged in user may look', async () => {
    expect((await (await loggedInAs(app, SEEDED.westlands)).get('/api/courses/crs_501/job-matches')).status).toBe(200);
  });
});

describe('POST /api/me/applications', () => {
  it('applies at Kazi for the graduate, saves Kazi\'s application id, and answers 201 with a Location', async () => {
    const start = inDays(30);
    const res = await (await graduate()).post('/api/me/applications').send(apply({ preferredDate: start, note: 'After 2pm' }));
    expect(res.status).toBe(201);
    expectApplicationShape(res.body);
    expect(res.body).toMatchObject({ applicationId: 'app_1005', jobId: 'job_12345', preferredDate: start, note: 'After 2pm', status: 'pending' });
    expect(res.headers.location).toBe('/api/me/applications/app_1005');
    expect(await (await getStore()).getKaziApplication('app_1005')).toMatchObject({ graduate_id: 'grd_0101', job_id: 'job_12345', status: 'pending' });
  });

  it('sends Kazi only the graduate\'s Ujuzi id: no name, email or phone', async () => {
    await applied();
    expect(JSON.stringify([...kazi.stub.applications.values()])).not.toMatch(/Otieno|Achieng|@|example\.com|07\d{8}/);
    expect(kazi.stub.applications.get('app_1005')?.studentId).toBe('grd_0101');
  });

  it('turns an offset into UTC with a Z, and leaves the note empty when none is sent', async () => {
    const res = await (await graduate()).post('/api/me/applications').send(apply({ preferredDate: '2031-05-04T11:30:00.750+03:00' }));
    expect(res.body).toMatchObject({ preferredDate: '2031-05-04T08:30:00Z', note: '' });
    expect(kazi.stub.applications.get('app_1005')).toMatchObject({ preferredDate: '2031-05-04T08:30:00Z', note: '' });
  });

  it('shows up in the graduate\'s list, and only theirs', async () => {
    const mine = await applied();
    const theirs = await (await graduate(SEEDED.brian)).get('/api/me/applications');
    expect(theirs.body).toEqual([]);
    const list = await (await graduate()).get('/api/me/applications');
    expect(list.body).toEqual([mine]);
  });

  it('answers 409 for a closed job, with our own words, and saves nothing', async () => {
    const res = await (await graduate()).post('/api/me/applications').send(apply({ jobId: 'job_12349' }));
    expect(res.status).toBe(409);
    expectErrorBody(res.body, 'Job job_12349 is closed and is not accepting applications');
    expect((await (await graduate()).get('/api/me/applications')).body).toEqual([]);
  });

  it('answers 400 for a job Kazi does not know, with our own words, and saves nothing', async () => {
    const res = await (await graduate()).post('/api/me/applications').send(apply({ jobId: 'job_nope' }));
    expect(res.status).toBe(400);
    expectErrorBody(res.body, 'Kazi Connect did not accept this application: check that the job exists and the date is in the future');
    expect(JSON.stringify(res.body)).not.toContain('does not exist'); // Kazi's own message is not passed through
    expect((await (await graduate()).get('/api/me/applications')).body).toEqual([]);
  });

  it('answers 400 for a jobId with markup or path characters in it, without asking Kazi', async () => {
    for (const jobId of ['<script>alert(1)</script>', '../applications', 'job 1?x=1']) {
      const res = await (await graduate()).post('/api/me/applications').send(apply({ jobId }));
      expect(res.status).toBe(400);
      expectErrorBody(res.body, 'jobId must be a text id of up to 64 characters, for example job_12345');
    }
    expect((await (await graduate()).get('/api/me/applications')).body).toEqual([]);
  });

  it.each([
    ['no body', undefined, 'Request body must be a JSON object'],
    ['an empty object', {}, 'Missing required field(s): jobId, preferredDate'],
    ['an unknown field', apply({ studentId: 'grd_0999' }), 'Unknown field(s): studentId'],
    ['a jobId that is a number', apply({ jobId: 1 }), /^jobId must be a text id/],
    ['a date in the past', apply({ preferredDate: '2020-01-01T09:00:00Z' }), /^preferredDate must be a future date-time/],
    ['a date with no time', apply({ preferredDate: '2031-05-04' }), /^preferredDate must be a future date-time/],
    ['a note over 500 characters', apply({ note: 'x'.repeat(501) }), 'note must be text of up to 500 characters'],
    ['a note that is a number', apply({ note: 5 }), 'note must be text of up to 500 characters'],
  ])('answers 400 { message } for %s, without asking Kazi', async (_name, body, message) => {
    const g = await graduate();
    const res = body === undefined ? await g.post('/api/me/applications') : await g.post('/api/me/applications').send(body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
    expect(kazi.stub.requests).toEqual([]);
  });

  it('answers 413 for a body over 20 KB, 403 for staff, 401 without a login and 401 for a partner key', async () => {
    expect((await (await graduate()).post('/api/me/applications').send(apply({ note: 'x'.repeat(21_000) }))).status).toBe(413);
    const staff = await (await loggedInAs(app, SEEDED.westlands)).post('/api/me/applications').send(apply());
    expect(staff.status).toBe(403);
    expectErrorBody(staff.body, 'Only graduates can do this');
    expect((await request(app.server).post('/api/me/applications').send(apply())).status).toBe(401);
    expect((await partner(app).post('/api/me/applications').send(apply())).status).toBe(401);
    expect(kazi.stub.applications.size).toBe(0);
  });

  it('withdraws the application at Kazi again if Ujuzi cannot save it, so nothing is left that we cannot see', async () => {
    const store = await getStore();
    const spy = jest.spyOn(store, 'createKaziApplication').mockRejectedValueOnce(new Error('disk full'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await (await graduate()).post('/api/me/applications').send(apply());
    expect(res.status).toBe(500);
    expectErrorBody(res.body, 'Something went wrong on our side. Please try again.');
    expect(kazi.stub.applications.size).toBe(0);
    spy.mockRestore();
    error.mockRestore();
  });
});

describe('PUT /api/me/applications/{id}', () => {
  const put = async (email: string, id: string, body: unknown) => (await graduate(email)).put(`/api/me/applications/${id}`).send(body as object);

  it('reschedules a pending application at Kazi and answers it', async () => {
    const mine = await applied(SEEDED.achieng, { note: 'first' });
    const later = inDays(40);
    const res = await put(SEEDED.achieng, mine.applicationId, { preferredDate: later, note: 'second' });
    expect(res.status).toBe(200);
    expectApplicationShape(res.body);
    expect(res.body).toMatchObject({ applicationId: mine.applicationId, preferredDate: later, note: 'second', status: 'pending' });
    expect(kazi.stub.applications.get(mine.applicationId)).toMatchObject({ preferredDate: later, note: 'second' });
    expect((await (await graduate()).get('/api/me/applications')).body).toEqual([res.body]);
  });

  it('sets an absolute state: leaving the note out clears it, and the same body twice changes nothing more', async () => {
    const mine = await applied(SEEDED.achieng, { note: 'to be cleared' });
    const body = { preferredDate: inDays(41) };
    const first = await put(SEEDED.achieng, mine.applicationId, body);
    const second = await put(SEEDED.achieng, mine.applicationId, body);
    expect(first.body.note).toBe('');
    expect(second.body).toEqual(first.body);
  });

  it('answers 404 for someone else\'s application, as if it did not exist, and changes nothing', async () => {
    const mine = await applied();
    const res = await put(SEEDED.brian, mine.applicationId, { preferredDate: inDays(40) });
    expect(res.status).toBe(404);
    expectErrorBody(res.body, `Application ${mine.applicationId} not found`);
    expect(kazi.stub.applications.get(mine.applicationId)?.preferredDate).toBe(mine.preferredDate);
  });

  it.each([
    ['no preferredDate', {}, 'Missing required field(s): preferredDate'],
    ['an unknown field', { preferredDate: inDays(40), jobId: 'job_12346' }, 'Unknown field(s): jobId'],
    ['a date in the past', { preferredDate: '2020-01-01T09:00:00Z' }, /^preferredDate must be a future date-time/],
  ])('answers 400 for %s, changing nothing and not asking Kazi', async (_name, body, message) => {
    const mine = await applied();
    kazi.stub.requests.length = 0;
    const res = await put(SEEDED.achieng, mine.applicationId, body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
    expect(kazi.stub.requests).toEqual([]);
  });

  it('checks the body before the application: a bad body for an unknown application is 400', async () => {
    expect((await put(SEEDED.achieng, 'app_9999', { preferredDate: '2020-01-01T09:00:00Z' })).status).toBe(400);
    expect((await put(SEEDED.achieng, 'app_9999', { preferredDate: inDays(40) })).status).toBe(404);
  });

  it('answers 409 without bothering Kazi when Ujuzi already knows the application is decided', async () => {
    const mine = await applied();
    await (await getStore()).updateKaziApplication(mine.applicationId, { status: 'filled' });
    kazi.stub.requests.length = 0;
    const res = await put(SEEDED.achieng, mine.applicationId, { preferredDate: inDays(40) });
    expect(res.status).toBe(409);
    expectErrorBody(res.body, `Application ${mine.applicationId} is filled; only pending applications can be changed`);
    expect(kazi.stub.requests).toEqual([]);
  });

  it('answers 409 when Kazi has decided it behind our back, and learns the real status', async () => {
    const mine = await appliedUnwatched();
    kazi.stub.accept(mine.applicationId);
    const res = await put(SEEDED.achieng, mine.applicationId, { preferredDate: inDays(40) });
    expect(res.status).toBe(409);
    expectErrorBody(res.body, `Application ${mine.applicationId} has already been decided at Kazi Connect and can no longer be changed`);
    expect((await (await getStore()).getKaziApplication(mine.applicationId))?.status).toBe('accepted');
  });

  it('answers 404 when Kazi no longer has the application, and marks it cancelled here', async () => {
    const mine = await appliedUnwatched();
    kazi.stub.applications.delete(mine.applicationId);
    const res = await put(SEEDED.achieng, mine.applicationId, { preferredDate: inDays(40) });
    expect(res.status).toBe(404);
    expectErrorBody(res.body, `Application ${mine.applicationId} no longer exists at Kazi Connect`);
    expect((await (await getStore()).getKaziApplication(mine.applicationId))?.status).toBe('cancelled');
  });

  it('answers 403 for staff and 401 without a login', async () => {
    const mine = await applied();
    expect((await put(SEEDED.westlands, mine.applicationId, { preferredDate: inDays(40) })).status).toBe(403);
    expect((await request(app.server).put(`/api/me/applications/${mine.applicationId}`).send({ preferredDate: inDays(40) })).status).toBe(401);
  });
});

describe('DELETE /api/me/applications/{id}', () => {
  const del = async (email: string, id: string) => (await graduate(email)).delete(`/api/me/applications/${id}`);

  it('withdraws a pending application: 204, gone at Kazi, and kept in the list as cancelled', async () => {
    const mine = await applied();
    const res = await del(SEEDED.achieng, mine.applicationId);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(kazi.stub.applications.has(mine.applicationId)).toBe(false);
    const list = await (await graduate()).get('/api/me/applications');
    expect(list.body).toEqual([{ ...mine, status: 'cancelled' }]);
  });

  it('answers 409 the second time: it is cancelled, so it can no longer be withdrawn', async () => {
    const mine = await applied();
    await del(SEEDED.achieng, mine.applicationId);
    const again = await del(SEEDED.achieng, mine.applicationId);
    expect(again.status).toBe(409);
    expectErrorBody(again.body, `Application ${mine.applicationId} is cancelled; only pending applications can be withdrawn`);
  });

  it('answers 404 for someone else\'s application and for one that never existed, withdrawing nothing', async () => {
    const mine = await applied();
    expect((await del(SEEDED.brian, mine.applicationId)).status).toBe(404);
    expect((await del(SEEDED.achieng, 'app_9999')).status).toBe(404);
    expect(kazi.stub.applications.has(mine.applicationId)).toBe(true);
  });

  it('answers 409 when Kazi has decided it behind our back, and learns the real status', async () => {
    const mine = await appliedUnwatched();
    kazi.stub.accept(mine.applicationId);
    const res = await del(SEEDED.achieng, mine.applicationId);
    expect(res.status).toBe(409);
    expectErrorBody(res.body, `Application ${mine.applicationId} has already been decided at Kazi Connect and can no longer be withdrawn`);
    expect((await (await getStore()).getKaziApplication(mine.applicationId))?.status).toBe('accepted');
  });

  it('counts it as withdrawn when Kazi has already lost it: 204, and cancelled here', async () => {
    const mine = await appliedUnwatched();
    kazi.stub.applications.delete(mine.applicationId);
    expect((await del(SEEDED.achieng, mine.applicationId)).status).toBe(204);
    expect((await (await getStore()).getKaziApplication(mine.applicationId))?.status).toBe('cancelled');
  });

  it('answers 403 for staff and 401 without a login', async () => {
    const mine = await applied();
    expect((await del(SEEDED.westlands, mine.applicationId)).status).toBe(403);
    expect((await request(app.server).delete(`/api/me/applications/${mine.applicationId}`)).status).toBe(401);
  });
});

describe('GET /api/me/applications', () => {
  it('lists the graduate\'s applications oldest first, withdrawn ones included', async () => {
    const first = await applied();
    const second = await applied(SEEDED.achieng, { jobId: 'job_12346' });
    await (await graduate()).delete(`/api/me/applications/${first.applicationId}`);
    const list = await (await graduate()).get('/api/me/applications');
    expect(list.status).toBe(200);
    expect(list.body.map((a: { applicationId: string; status: string }) => [a.applicationId, a.status])).toEqual([
      [first.applicationId, 'cancelled'],
      [second.applicationId, 'pending'],
    ]);
  });

  it('answers [] for a graduate with none, 403 for staff, 401 without a login', async () => {
    expect((await (await graduate(SEEDED.mwanaisha)).get('/api/me/applications')).body).toEqual([]);
    expect((await (await loggedInAs(app, SEEDED.westlands)).get('/api/me/applications')).status).toBe(403);
    expect((await request(app.server).get('/api/me/applications')).status).toBe(401);
  });

  it('answers from Ujuzi\'s own records and does not need Kazi at all', async () => {
    await applied();
    await kazi.stub.down();
    expect((await (await graduate()).get('/api/me/applications')).body).toHaveLength(1);
  });
});

describe('GET /api/me/applications/feed over plain HTTP', () => {
  it('answers 426 { message }: it is a WebSocket endpoint', async () => {
    const res = await request(app.server).get('/api/me/applications/feed');
    expect(res.status).toBe(426);
    expectErrorBody(res.body, 'Connect to this endpoint with a WebSocket client');
    expect(res.headers.upgrade).toBe('websocket');
  });
});

describe('when Kazi Connect is down (R7: containment)', () => {
  it('answers its own 502 { message } for everything that needs Kazi, and changes nothing', async () => {
    const mine = await applied();
    await kazi.stub.down();
    const g = await graduate();

    const matches = await g.get('/api/courses/crs_501/job-matches');
    expect(matches.status).toBe(502);
    expectErrorBody(matches.body, UNREACHABLE);

    const create = await g.post('/api/me/applications').send(apply({ jobId: 'job_12346' }));
    expect(create.status).toBe(502);
    expectErrorBody(create.body, UNREACHABLE);

    const change = await g.put(`/api/me/applications/${mine.applicationId}`).send({ preferredDate: inDays(50) });
    expect(change.status).toBe(502);
    expectErrorBody(change.body, UNREACHABLE);

    const withdraw = await g.delete(`/api/me/applications/${mine.applicationId}`);
    expect(withdraw.status).toBe(502);
    expectErrorBody(withdraw.body, UNREACHABLE);

    const list = (await g.get('/api/me/applications')).body;
    expect(list).toEqual([mine]); // nothing was saved, changed or cancelled
  });

  it('keeps courses, certificates, bookings, accounts and enrolments working', async () => {
    await kazi.stub.down();
    const key = partner(app);
    expect((await key.get('/api/courses')).status).toBe(200);
    expect((await key.get('/api/certificates/UJZ-2026-00123')).status).toBe(200);
    const booked = await key.post('/api/bookings').send({ courseId: 'crs_501', crewSize: 6, preferredStart: inDays(30), eventName: 'Kazi is down wedding' });
    expect(booked.status).toBe(201);
    expect((await key.get(`/api/bookings/${booked.body.id}`)).status).toBe(200);
    const staff = await loggedInAs(app, SEEDED.westlands);
    expect((await staff.patch(`/api/bookings/${booked.body.id}`).send({ status: 'confirmed' })).status).toBe(200);
    const g = await graduate(SEEDED.mwanaisha);
    expect((await g.get('/api/me')).status).toBe(200);
    expect((await g.post('/api/enrolments').send({ courseId: 'crs_503' })).status).toBe(201);
  });

  it('gives up on a Kazi that never answers after the timeout, with the same 502', async () => {
    process.env.KAZI_USER_TIMEOUT_MS = '200';
    kazi.stub.hang(true);
    const started = Date.now();
    const res = await (await graduate()).get('/api/courses/crs_501/job-matches');
    expect(res.status).toBe(502);
    expectErrorBody(res.body, UNREACHABLE);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('answers 502, not a crash, when Kazi sends something unusable', async () => {
    const original = fetch;
    global.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      String(input).includes('/api/jobs') ? new Response('<html>oops</html>', { status: 200 }) : original(input, init)) as typeof fetch;
    try {
      const res = await (await graduate()).get('/api/courses/crs_501/job-matches');
      expect(res.status).toBe(502);
      expectErrorBody(res.body, UNREACHABLE);
    } finally {
      global.fetch = original;
    }
  });

  it('works again as soon as Kazi is back', async () => {
    await kazi.stub.down();
    expect((await (await graduate()).get('/api/courses/crs_501/job-matches')).status).toBe(502);
    await kazi.stub.up();
    expect((await (await graduate()).get('/api/courses/crs_501/job-matches')).status).toBe(200);
  });
});
