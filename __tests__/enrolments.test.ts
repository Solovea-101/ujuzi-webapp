import request from 'supertest';
import { getStore, resetStore } from '@/lib/db';
import { as, loggedInAs, login, SEEDED } from './helpers/auth';
import { partner, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys, ISO_SECONDS } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());
beforeEach(() => resetStore());

function expectEnrolmentShape(enrolment: Record<string, unknown>) {
  expectKeys(enrolment, ['id', 'courseId', 'courseTitle', 'enrolledAt', 'certificateNo']);
  expect(enrolment.id).toMatch(/^enr_\d+$/);
  expect(enrolment.courseId).toMatch(/^crs_\d+$/);
  expect(typeof enrolment.courseTitle).toBe('string');
  expect(enrolment.enrolledAt).toMatch(ISO_SECONDS);
  expect(enrolment.certificateNo === null || /^UJZ-\d{4}-\d{5}$/.test(enrolment.certificateNo as string)).toBe(true);
}

describe('POST /api/enrolments', () => {
  it('enrols the logged in graduate: 201 with the enrolment, and no certificate yet', async () => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    const res = await graduate.post('/api/enrolments').send({ courseId: 'crs_501' });
    expect(res.status).toBe(201);
    expectEnrolmentShape(res.body);
    expect(res.body).toMatchObject({
      id: 'enr_0004', // three enrolments are seeded
      courseId: 'crs_501',
      courseTitle: 'Food hygiene and event service',
      certificateNo: null,
    });
  });

  it('shows up in the graduate\'s own list', async () => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    await graduate.post('/api/enrolments').send({ courseId: 'crs_503' });
    const list = await graduate.get('/api/me/enrolments');
    expect(list.body.map((e: { courseId: string }) => e.courseId)).toEqual(['crs_505', 'crs_503']);
  });

  it('answers 409 when the graduate is already enrolled, and enrols them only once', async () => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    expect((await graduate.post('/api/enrolments').send({ courseId: 'crs_503' })).status).toBe(201);
    const again = await graduate.post('/api/enrolments').send({ courseId: 'crs_503' });
    expect(again.status).toBe(409);
    expectErrorBody(again.body, 'You are already enrolled in course crs_503');
    const seeded = await graduate.post('/api/enrolments').send({ courseId: 'crs_505' });
    expect(seeded.status).toBe(409);
    expect((await graduate.get('/api/me/enrolments')).body).toHaveLength(2);
  });

  it('lets two graduates enrol in the same course', async () => {
    const a = await loggedInAs(app, SEEDED.mwanaisha);
    const b = await loggedInAs(app, SEEDED.achieng);
    expect((await a.post('/api/enrolments').send({ courseId: 'crs_506' })).status).toBe(201);
    expect((await b.post('/api/enrolments').send({ courseId: 'crs_506' })).status).toBe(201);
  });

  it('answers 404 for a course that does not exist, and enrols nothing', async () => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    const res = await graduate.post('/api/enrolments').send({ courseId: 'crs_999' });
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Course crs_999 not found');
    expect((await graduate.get('/api/me/enrolments')).body).toHaveLength(1);
  });

  it.each([
    ['no body', undefined, 'Request body must be a JSON object'],
    ['an empty object', {}, 'Missing required field(s): courseId'],
    ['an unknown field', { courseId: 'crs_501', graduateId: 'grd_0101' }, 'Unknown field(s): graduateId'],
    ['a courseId that is a number', { courseId: 501 }, /^courseId must be a text id/],
    ['an empty courseId', { courseId: '  ' }, /^courseId must be a text id/],
    ['a courseId over 64 characters', { courseId: 'c'.repeat(65) }, /^courseId must be a text id/],
  ])('answers 400 { message } for %s', async (_name, body, message) => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    const res = body === undefined ? await graduate.post('/api/enrolments') : await graduate.post('/api/enrolments').send(body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
    expect((await graduate.get('/api/me/enrolments')).body).toHaveLength(1);
  });

  it('checks the body before the course: a bad body for an unknown course is 400, not 404', async () => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    expect((await graduate.post('/api/enrolments').send({ courseId: 'crs_999', extra: 1 })).status).toBe(400);
  });

  it('answers 413 for a body over 20 KB', async () => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    const res = await graduate.post('/api/enrolments').send({ courseId: 'x'.repeat(21_000) });
    expect(res.status).toBe(413);
  });

  it('cannot enrol someone else: the graduate always comes from the token', async () => {
    const graduate = await loggedInAs(app, SEEDED.mwanaisha);
    await graduate.post('/api/enrolments').send({ courseId: 'crs_503' });
    const store = await getStore();
    expect((await store.listEnrolments('grd_0101')).map((e) => e.course_id)).toEqual(['crs_501']);
    expect((await store.listEnrolments('grd_0103')).map((e) => e.course_id)).toEqual(['crs_505', 'crs_503']);
  });

  it('answers 403 for staff, 401 without a login, and 401 for a partner key', async () => {
    const staff = await loggedInAs(app, SEEDED.westlands);
    const forbidden = await staff.post('/api/enrolments').send({ courseId: 'crs_501' });
    expect(forbidden.status).toBe(403);
    expectErrorBody(forbidden.body, 'Only graduates can do this');
    expect((await request(app.server).post('/api/enrolments').send({ courseId: 'crs_501' })).status).toBe(401);
    expect((await partner(app).post('/api/enrolments').send({ courseId: 'crs_501' })).status).toBe(401);
  });
});

describe('GET /api/me/enrolments', () => {
  it('lists a graduate\'s enrolment with its certificate number', async () => {
    const res = await (await loggedInAs(app, SEEDED.achieng)).get('/api/me/enrolments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expectEnrolmentShape(res.body[0]);
    expect(res.body[0]).toMatchObject({
      id: 'enr_0001', courseId: 'crs_501', courseTitle: 'Food hygiene and event service', certificateNo: 'UJZ-2026-00123',
    });
  });

  it('still lists a revoked certificate: the number is the graduate\'s record, valid is for the check', async () => {
    const res = await (await loggedInAs(app, SEEDED.brian)).get('/api/me/enrolments');
    expect(res.body[0]).toMatchObject({ id: 'enr_0002', certificateNo: 'UJZ-2026-00124' });
  });

  it('shows null where no certificate has been issued', async () => {
    const res = await (await loggedInAs(app, SEEDED.mwanaisha)).get('/api/me/enrolments');
    expect(res.body).toEqual([expect.objectContaining({ id: 'enr_0003', courseId: 'crs_505', certificateNo: null })]);
  });

  it('answers [] with 200 for a graduate with no enrolments', async () => {
    const created = await request(app.server).post('/api/auth/register').send({
      role: 'graduate', email: 'fresh@example.com', password: 'a long passphrase', firstName: 'Fresh', lastName: 'Start',
    });
    const res = await as(app, created.body.token).get('/api/me/enrolments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists only the logged in graduate\'s own enrolments', async () => {
    const ids = async (email: string) => (await (await loggedInAs(app, email)).get('/api/me/enrolments')).body.map((e: { id: string }) => e.id);
    expect(await ids(SEEDED.achieng)).toEqual(['enr_0001']);
    expect(await ids(SEEDED.brian)).toEqual(['enr_0002']);
    expect(await ids(SEEDED.mwanaisha)).toEqual(['enr_0003']);
  });

  it('answers 403 for staff and 401 without a login', async () => {
    const forbidden = await (await loggedInAs(app, SEEDED.westlands)).get('/api/me/enrolments');
    expect(forbidden.status).toBe(403);
    expectErrorBody(forbidden.body, 'Only graduates can do this');
    const res = await request(app.server).get('/api/me/enrolments');
    expect(res.status).toBe(401);
    expectErrorBody(res.body, 'Log in and send Authorization: Bearer YOUR_TOKEN');
  });

  it('stops working with the token after logout', async () => {
    const token = await login(app, SEEDED.achieng);
    expect((await as(app, token).get('/api/me/enrolments')).status).toBe(200);
    await as(app, token).post('/api/auth/logout');
    expect((await as(app, token).get('/api/me/enrolments')).status).toBe(401);
  });
});
