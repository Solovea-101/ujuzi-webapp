import request from 'supertest';
import { getStore, resetStore } from '@/lib/db';
import { loggedInAs, SEEDED } from './helpers/auth';
import { partner, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys, inDays, ISO_SECONDS } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());
beforeEach(() => resetStore());

const course = (over: Record<string, unknown> = {}) => ({
  title: 'Barista basics', category: 'catering', durationWeeks: 3, feeKes: 4200, nextStart: inDays(40), certificateLevel: 'short-course', ...over,
});
const getCourse = (id: string) => partner(app).get(`/api/courses/${id}`);
const LOGIN = 'Log in and send Authorization: Bearer YOUR_TOKEN';

function expectCourseShape(body: Record<string, unknown>) {
  expectKeys(body, ['id', 'title', 'category', 'centre', 'county', 'area', 'durationWeeks', 'feeKes', 'nextStart', 'certificateLevel']);
  expect(body.nextStart).toMatch(ISO_SECONDS);
}

describe('POST /api/courses', () => {
  it('creates a course at the staff member\'s own centre: 201 and a Location', async () => {
    const staff = await loggedInAs(app, SEEDED.westlands);
    const body = course();
    const res = await staff.post('/api/courses').send(body);
    expect(res.status).toBe(201);
    expectCourseShape(res.body);
    expect(res.body).toMatchObject({
      id: 'crs_510', // nine courses are seeded
      title: 'Barista basics', category: 'catering',
      centre: { id: 'cen_11', name: 'Westlands Skills Centre' }, county: 'Nairobi', area: 'Westlands',
      durationWeeks: 3, feeKes: 4200, nextStart: body.nextStart, certificateLevel: 'short-course',
    });
    expect(res.headers.location).toBe('/api/courses/crs_510');
  });

  it('can be read back, by the partner and by the website', async () => {
    const created = await (await loggedInAs(app, SEEDED.westlands)).post('/api/courses').send(course());
    expect((await getCourse('crs_510')).body).toEqual(created.body);
    expect((await partner(app).get('/api/courses?category=catering&county=Nairobi')).body.map((c: { id: string }) => c.id)).toEqual(['crs_501', 'crs_510']);
  });

  it('always puts the course at the staff member\'s centre, whichever centre that is', async () => {
    const res = await (await loggedInAs(app, SEEDED.nyali)).post('/api/courses').send(course({ category: 'tutoring' }));
    expect(res.body).toMatchObject({ centre: { id: 'cen_15' }, county: 'Mombasa', area: 'Nyali' });
  });

  it('cannot be told which centre: centreId is an unknown field', async () => {
    const res = await (await loggedInAs(app, SEEDED.westlands)).post('/api/courses').send({ ...course(), centreId: 'cen_12' });
    expect(res.status).toBe(400);
    expectErrorBody(res.body, 'Unknown field(s): centreId');
  });

  it('trims the title', async () => {
    const res = await (await loggedInAs(app, SEEDED.westlands)).post('/api/courses').send(course({ title: '  Barista basics  ' }));
    expect(res.body.title).toBe('Barista basics');
  });

  it.each([
    ['no body', undefined, 'Request body must be a JSON object'],
    ['an empty object', {}, 'Missing required field(s): title, category, durationWeeks, feeKes, nextStart, certificateLevel'],
    ['an empty title', course({ title: ' ' }), 'title must be 1 to 120 characters'],
    ['a title of 121 characters', course({ title: 'x'.repeat(121) }), 'title must be 1 to 120 characters'],
    ['an unknown category', course({ category: 'cooking' }), /^category must be one of accommodation, campus/],
    ['durationWeeks 0', course({ durationWeeks: 0 }), 'durationWeeks must be a whole number from 1 to 104'],
    ['durationWeeks 105', course({ durationWeeks: 105 }), 'durationWeeks must be a whole number from 1 to 104'],
    ['durationWeeks 1.5', course({ durationWeeks: 1.5 }), 'durationWeeks must be a whole number from 1 to 104'],
    ['a negative fee', course({ feeKes: -1 }), /^feeKes must be a whole number of shillings/],
    ['a fee over 1,000,000', course({ feeKes: 1_000_001 }), /^feeKes must be a whole number of shillings/],
    ['a fee with cents', course({ feeKes: 99.5 }), /^feeKes must be a whole number of shillings/],
    ['a fee as text', course({ feeKes: '4200' }), /^feeKes must be a whole number of shillings/],
    ['a start in the past', course({ nextStart: '2020-01-01T07:00:00Z' }), /^nextStart must be a future date-time/],
    ['a start on 30 February', course({ nextStart: '2031-02-30T07:00:00Z' }), /^nextStart must be a future date-time/],
    ['an unknown level', course({ certificateLevel: 'grade-IV' }), /^certificateLevel must be one of short-course/],
  ])('answers 400 { message } and creates nothing for %s', async (_name, body, message) => {
    const staff = await loggedInAs(app, SEEDED.westlands);
    const res = body === undefined ? await staff.post('/api/courses') : await staff.post('/api/courses').send(body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
    expect((await getCourse('crs_510')).status).toBe(404);
  });

  it('answers 413 for a body over 20 KB', async () => {
    const res = await (await loggedInAs(app, SEEDED.westlands)).post('/api/courses').send(course({ title: 'x'.repeat(21_000) }));
    expect(res.status).toBe(413);
  });

  it('answers 403 for a graduate, 401 without a login and 401 for a partner key, creating nothing', async () => {
    const forbidden = await (await loggedInAs(app, SEEDED.achieng)).post('/api/courses').send(course());
    expect(forbidden.status).toBe(403);
    expectErrorBody(forbidden.body, 'Only staff can do this');
    const none = await request(app.server).post('/api/courses').send(course());
    expect(none.status).toBe(401);
    expectErrorBody(none.body, LOGIN);
    expect((await partner(app).post('/api/courses').send(course())).status).toBe(401);
    expect((await getCourse('crs_510')).status).toBe(404);
  });
});

describe('PUT /api/courses/{courseId}', () => {
  it('replaces every detail of the centre\'s own course and answers the updated course', async () => {
    const staff = await loggedInAs(app, SEEDED.westlands);
    const body = course({ title: 'Food hygiene, advanced', category: 'events', durationWeeks: 4, feeKes: 5000, certificateLevel: 'grade-III' });
    const res = await staff.put('/api/courses/crs_501').send(body);
    expect(res.status).toBe(200);
    expectCourseShape(res.body);
    expect(res.body).toMatchObject({
      id: 'crs_501', title: 'Food hygiene, advanced', category: 'events', durationWeeks: 4, feeKes: 5000,
      certificateLevel: 'grade-III', centre: { id: 'cen_11' }, nextStart: body.nextStart,
    });
    expect((await getCourse('crs_501')).body).toEqual(res.body);
  });

  it('is idempotent: the same body twice leaves the same course', async () => {
    const staff = await loggedInAs(app, SEEDED.westlands);
    const body = course();
    const first = await staff.put('/api/courses/crs_502').send(body);
    const second = await staff.put('/api/courses/crs_502').send(body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it('answers 403 for staff of another centre, and changes nothing', async () => {
    const before = (await getCourse('crs_501')).body;
    const res = await (await loggedInAs(app, SEEDED.hurlingham)).put('/api/courses/crs_501').send(course());
    expect(res.status).toBe(403);
    expectErrorBody(res.body, 'Only staff at this centre can change its courses');
    expect((await getCourse('crs_501')).body).toEqual(before);
  });

  it('answers 404 for an unknown course', async () => {
    const res = await (await loggedInAs(app, SEEDED.westlands)).put('/api/courses/crs_999').send(course());
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Course crs_999 not found');
  });

  it('answers 400 for an invalid body, changes nothing, and checks the body before the course', async () => {
    const staff = await loggedInAs(app, SEEDED.westlands);
    const before = (await getCourse('crs_501')).body;
    const res = await staff.put('/api/courses/crs_501').send(course({ durationWeeks: 0 }));
    expect(res.status).toBe(400);
    expect((await getCourse('crs_501')).body).toEqual(before);
    expect((await staff.put('/api/courses/crs_999').send(course({ durationWeeks: 0 }))).status).toBe(400);
  });

  it('answers 403 for a graduate and 401 without a login', async () => {
    expect((await (await loggedInAs(app, SEEDED.achieng)).put('/api/courses/crs_501').send(course())).status).toBe(403);
    const none = await request(app.server).put('/api/courses/crs_501').send(course());
    expect(none.status).toBe(401);
    expectErrorBody(none.body, LOGIN);
  });
});

describe('POST /api/certificates', () => {
  // Mwanaisha (grd_0103) is enrolled in crs_505 (enr_0003), a course of Ruaka's centre cen_13.
  const issue = async (email: string, body: unknown) => (await loggedInAs(app, email)).post('/api/certificates').send(body as object);

  it('issues a certificate for an enrolment at the staff member\'s centre: 201 and a Location', async () => {
    const res = await issue(SEEDED.ruaka, { enrolmentId: 'enr_0003' });
    expect(res.status).toBe(201);
    expectKeys(res.body, ['certificateNo', 'valid', 'courseTitle', 'level', 'issuedOn', 'holder']);
    expect(res.body.certificateNo).toMatch(new RegExp(`^UJZ-${new Date().getUTCFullYear()}-\\d{5}$`));
    expect(res.body).toMatchObject({
      valid: true, courseTitle: 'Housekeeping and guest room care', level: 'short-course',
      issuedOn: new Date().toISOString().slice(0, 10), holder: 'Mwanaisha J.',
    });
    expect(res.headers.location).toBe(`/api/certificates/${res.body.certificateNo}`);
  });

  it('can then be checked by the partner, and shows in the graduate\'s enrolments', async () => {
    const issued = await issue(SEEDED.ruaka, { enrolmentId: 'enr_0003' });
    const check = await partner(app).get(`/api/certificates/${issued.body.certificateNo}`);
    expect(check.status).toBe(200);
    expect(check.body).toEqual(issued.body);
    const mine = await (await loggedInAs(app, SEEDED.mwanaisha)).get('/api/me/enrolments');
    expect(mine.body[0].certificateNo).toBe(issued.body.certificateNo);
  });

  it('answers 409 the second time, and for an enrolment that was already certified', async () => {
    await issue(SEEDED.ruaka, { enrolmentId: 'enr_0003' });
    const again = await issue(SEEDED.ruaka, { enrolmentId: 'enr_0003' });
    expect(again.status).toBe(409);
    expectErrorBody(again.body, 'A certificate was already issued for enrolment enr_0003');
    expect((await issue(SEEDED.westlands, { enrolmentId: 'enr_0001' })).status).toBe(409); // seeded as UJZ-2026-00123
  });

  it('keeps the title and level as they were when it was issued, even if the course is edited later', async () => {
    const issued = await issue(SEEDED.ruaka, { enrolmentId: 'enr_0003' });
    const edit = await (await loggedInAs(app, SEEDED.ruaka)).put('/api/courses/crs_505').send(course({ title: 'Renamed course', certificateLevel: 'grade-I' }));
    expect(edit.status).toBe(200);
    const check = await partner(app).get(`/api/certificates/${issued.body.certificateNo}`);
    expect(check.body).toMatchObject({ courseTitle: 'Housekeeping and guest room care', level: 'short-course' });
  });

  it('answers 403 for staff of another centre, and issues nothing', async () => {
    const res = await issue(SEEDED.westlands, { enrolmentId: 'enr_0003' });
    expect(res.status).toBe(403);
    expectErrorBody(res.body, 'Only staff at this centre can issue its certificates');
    expect((await (await getStore()).listCertificates('grd_0103'))).toEqual([]);
  });

  it('answers 404 for an enrolment that does not exist', async () => {
    const res = await issue(SEEDED.ruaka, { enrolmentId: 'enr_9999' });
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Enrolment enr_9999 not found');
  });

  it.each([
    ['no body', undefined, 'Request body must be a JSON object'],
    ['an empty object', {}, 'Missing required field(s): enrolmentId'],
    ['an unknown field', { enrolmentId: 'enr_0003', issuedOn: '2020-01-01' }, 'Unknown field(s): issuedOn'],
    ['an enrolmentId that is a number', { enrolmentId: 3 }, /^enrolmentId must be a text id/],
  ])('answers 400 { message } for %s', async (_name, body, message) => {
    const staff = await loggedInAs(app, SEEDED.ruaka);
    const res = body === undefined ? await staff.post('/api/certificates') : await staff.post('/api/certificates').send(body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
  });

  it('answers 403 for a graduate, 401 without a login and 401 for a partner key', async () => {
    expect((await issue(SEEDED.mwanaisha, { enrolmentId: 'enr_0003' })).status).toBe(403);
    expect((await request(app.server).post('/api/certificates').send({ enrolmentId: 'enr_0003' })).status).toBe(401);
    expect((await partner(app).post('/api/certificates').send({ enrolmentId: 'enr_0003' })).status).toBe(401);
  });
});

describe('GET /api/bookings (the staff list)', () => {
  const ids = async (email: string) => (await (await loggedInAs(app, email)).get('/api/bookings')).body.map((b: { id: string }) => b.id);

  it('lists the bookings for the staff member\'s own centre, in any status, with the contract shape', async () => {
    const res = await (await loggedInAs(app, SEEDED.westlands)).get('/api/bookings');
    expect(res.status).toBe(200);
    expect(res.body.map((b: { id: string; status: string }) => [b.id, b.status])).toEqual([['bkg_6001', 'pending'], ['bkg_6002', 'confirmed']]);
    for (const booking of res.body) expectKeys(booking, ['id', 'courseId', 'eventName', 'crewSize', 'preferredStart', 'status', 'createdAt']);
  });

  it('shows another centre nothing of it: [] with 200', async () => {
    const res = await (await loggedInAs(app, SEEDED.hurlingham)).get('/api/bookings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('follows a booking made by the partner to the centre that runs the course', async () => {
    const made = await partner(app).post('/api/bookings').send({ courseId: 'crs_503', crewSize: 4, preferredStart: inDays(30), eventName: 'Plumbing crew' });
    expect(made.status).toBe(201);
    expect(await ids(SEEDED.hurlingham)).toEqual([made.body.id]);
    expect(await ids(SEEDED.westlands)).toEqual(['bkg_6001', 'bkg_6002']);
  });

  it('answers 403 for a graduate, 401 without a login, 401 for a partner key', async () => {
    const forbidden = await (await loggedInAs(app, SEEDED.achieng)).get('/api/bookings');
    expect(forbidden.status).toBe(403);
    expectErrorBody(forbidden.body, 'Only staff can do this');
    expect((await request(app.server).get('/api/bookings')).status).toBe(401);
    expect((await partner(app).get('/api/bookings')).status).toBe(401);
  });
});

describe('PATCH /api/bookings/{bookingId}', () => {
  const patch = async (email: string, id: string, body: unknown) => (await loggedInAs(app, email)).patch(`/api/bookings/${id}`).send(body as object);
  const read = (id: string) => partner(app).get(`/api/bookings/${id}`);

  it('confirms a pending booking at the staff member\'s centre: 200 with the new status', async () => {
    const before = (await read('bkg_6001')).body;
    const res = await patch(SEEDED.westlands, 'bkg_6001', { status: 'confirmed' });
    expect(res.status).toBe(200);
    expectKeys(res.body, ['id', 'courseId', 'eventName', 'crewSize', 'preferredStart', 'status', 'createdAt']);
    expect(res.body).toEqual({ ...before, status: 'confirmed' });
    expect((await read('bkg_6001')).body).toEqual(res.body);
  });

  it('declines a pending booking, and the partner then cannot change or cancel it', async () => {
    const made = await partner(app).post('/api/bookings').send({ courseId: 'crs_502', crewSize: 5, preferredStart: inDays(30), eventName: 'Decline me' });
    const res = await patch(SEEDED.westlands, made.body.id, { status: 'declined' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('declined');
    const change = await partner(app).put(`/api/bookings/${made.body.id}`).send({ crewSize: 6, preferredStart: inDays(31) });
    expect(change.status).toBe(409);
    expectErrorBody(change.body, `Booking ${made.body.id} is declined; only pending bookings can be changed`);
    expect((await partner(app).delete(`/api/bookings/${made.body.id}`)).status).toBe(409);
  });

  it('a confirmed booking cannot be cancelled by the partner either', async () => {
    await patch(SEEDED.westlands, 'bkg_6001', { status: 'confirmed' });
    expect((await partner(app).delete('/api/bookings/bkg_6001')).status).toBe(409);
  });

  it('answers 409 for a decision that is already made, in either direction, and changes nothing', async () => {
    await patch(SEEDED.westlands, 'bkg_6001', { status: 'confirmed' });
    for (const status of ['declined', 'confirmed']) {
      const res = await patch(SEEDED.westlands, 'bkg_6001', { status });
      expect(res.status).toBe(409);
      expectErrorBody(res.body, 'Booking bkg_6001 is confirmed; only pending bookings can be decided');
    }
    expect((await read('bkg_6001')).body.status).toBe('confirmed');
    expect((await patch(SEEDED.westlands, 'bkg_6002', { status: 'declined' })).status).toBe(409); // seeded as confirmed
  });

  it('answers 403 for staff of another centre, and changes nothing', async () => {
    const res = await patch(SEEDED.hurlingham, 'bkg_6001', { status: 'confirmed' });
    expect(res.status).toBe(403);
    expectErrorBody(res.body, 'Only staff at this centre can decide its bookings.');
    expect((await read('bkg_6001')).body.status).toBe('pending');
  });

  it('checks the centre before the state: another centre\'s staff get 403 even for a booking already decided', async () => {
    expect((await patch(SEEDED.hurlingham, 'bkg_6002', { status: 'declined' })).status).toBe(403);
  });

  it('answers 404 for an unknown booking, and checks the body before the booking', async () => {
    const res = await patch(SEEDED.westlands, 'bkg_9999', { status: 'confirmed' });
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Booking bkg_9999 not found');
    expect((await patch(SEEDED.westlands, 'bkg_9999', { status: 'maybe' })).status).toBe(400);
  });

  it.each([
    ['pending, which is not a decision', { status: 'pending' }],
    ['a status in the wrong case', { status: 'CONFIRMED' }],
    ['a status that is a number', { status: 1 }],
    ['a status that is null', { status: null }],
  ])('answers 400 "status must be confirmed or declined" for %s, changing nothing', async (_name, body) => {
    const res = await patch(SEEDED.westlands, 'bkg_6001', body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, 'status must be confirmed or declined');
    expect((await read('bkg_6001')).body.status).toBe('pending');
  });

  it('answers 400 for a missing status, an unknown field, malformed JSON, and 413 for a body over 20 KB', async () => {
    expectErrorBody((await patch(SEEDED.westlands, 'bkg_6001', {})).body, 'Missing required field(s): status');
    expectErrorBody((await patch(SEEDED.westlands, 'bkg_6001', { status: 'confirmed', crewSize: 1 })).body, 'Unknown field(s): crewSize');
    const staff = await loggedInAs(app, SEEDED.westlands);
    expect((await staff.patch('/api/bookings/bkg_6001').set('Content-Type', 'application/json').send('{"status":')).status).toBe(400);
    expect((await staff.patch('/api/bookings/bkg_6001').send({ status: 'confirmed', padding: 'x'.repeat(21_000) })).status).toBe(413);
    expect((await read('bkg_6001')).body.status).toBe('pending');
  });

  it('answers 403 for a graduate, 401 without a login and 401 for a partner key, changing nothing', async () => {
    const forbidden = await patch(SEEDED.achieng, 'bkg_6001', { status: 'confirmed' });
    expect(forbidden.status).toBe(403);
    expectErrorBody(forbidden.body, 'Only staff can do this');
    expect((await request(app.server).patch('/api/bookings/bkg_6001').send({ status: 'confirmed' })).status).toBe(401);
    expect((await partner(app).patch('/api/bookings/bkg_6001').send({ status: 'confirmed' })).status).toBe(401);
    expect((await read('bkg_6001')).body.status).toBe('pending');
  });

  it('works for the staff of every seeded centre on that centre\'s course', async () => {
    const centres: Array<[string, string]> = [[SEEDED.hurlingham, 'crs_503'], [SEEDED.ruaka, 'crs_505'], [SEEDED.thikaRoad, 'crs_507'], [SEEDED.nyali, 'crs_508']];
    for (const [email, courseId] of centres) {
      const made = await partner(app).post('/api/bookings').send({ courseId, crewSize: 3, preferredStart: inDays(30), eventName: `Crew for ${courseId}` });
      expect(made.status).toBe(201);
      expect((await patch(email, made.body.id, { status: 'confirmed' })).status).toBe(200);
    }
  });
});
