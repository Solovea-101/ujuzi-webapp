import { getStore, resetStore } from '@/lib/db';
import { partner, startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys, inDays, ISO_SECONDS } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());
// Every test starts from the seed data, so a write in one test never shows up in another.
beforeEach(() => resetStore());

function expectBookingShape(booking: Record<string, unknown>) {
  expectKeys(booking, ['id', 'courseId', 'eventName', 'crewSize', 'preferredStart', 'status', 'createdAt']);
  expect(booking.id).toMatch(/^bkg_\d+$/);
  expect(booking.courseId).toMatch(/^crs_\d+$/);
  expect(typeof booking.eventName).toBe('string');
  expect(Number.isInteger(booking.crewSize)).toBe(true);
  expect(booking.preferredStart).toMatch(ISO_SECONDS);
  expect(['pending', 'confirmed', 'declined']).toContain(booking.status);
  expect(booking.createdAt).toMatch(ISO_SECONDS);
}

describe('GET /api/bookings/{bookingId}', () => {
  it('returns the pending booking from the contract example', async () => {
    const res = await partner(app).get('/api/bookings/bkg_6001');
    expect(res.status).toBe(200);
    expectBookingShape(res.body);
    expect(res.body).toMatchObject({
      id: 'bkg_6001',
      courseId: 'crs_501',
      eventName: 'Wanjiku and Otieno wedding',
      crewSize: 6,
      preferredStart: '2026-11-28T08:00:00Z',
      status: 'pending',
    });
  });

  it('returns a confirmed booking with its status', async () => {
    const res = await partner(app).get('/api/bookings/bkg_6002');
    expect(res.status).toBe(200);
    expectBookingShape(res.body);
    expect(res.body.status).toBe('confirmed');
  });

  it('answers 404 { message } for an unknown id', async () => {
    const res = await partner(app).get('/api/bookings/bkg_9999');
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Booking bkg_9999 not found');
  });
});

const newBooking = (over: Record<string, unknown> = {}) => ({
  courseId: 'crs_501',
  crewSize: 6,
  preferredStart: inDays(30),
  eventName: 'Kamau family reunion',
  ...over,
});

const create = async (over: Record<string, unknown> = {}) => {
  const res = await partner(app).post('/api/bookings').send(newBooking(over));
  expect(res.status).toBe(201);
  return res.body as { id: string; crewSize: number; preferredStart: string };
};

const get = (id: string) => partner(app).get(`/api/bookings/${id}`);

describe('test isolation', () => {
  it('shares one store with the server, and resetStore() gives the next test the seed data again', async () => {
    const created = await create({ eventName: 'Isolation check' });
    expect(await (await getStore()).getBooking(created.id)).toMatchObject({ event_name: 'Isolation check' });

    resetStore();
    expect((await get(created.id)).status).toBe(404);
    expect((await get('bkg_6001')).status).toBe(200);
  });
});

describe('POST /api/bookings', () => {
  it('creates a pending booking: 201, the booking, and a Location header', async () => {
    const start = inDays(30);
    const res = await partner(app).post('/api/bookings').send(newBooking({ preferredStart: start }));
    expect(res.status).toBe(201);
    expectBookingShape(res.body);
    expect(res.body).toMatchObject({
      id: 'bkg_6003', // the two seeded bookings are 6001 and 6002
      courseId: 'crs_501',
      eventName: 'Kamau family reunion',
      crewSize: 6,
      preferredStart: start,
      status: 'pending',
    });
    expect(res.headers.location).toBe('/api/bookings/bkg_6003');
  });

  it('can be read back with the same values', async () => {
    const created = await create();
    const fetched = await get(created.id);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created);
  });

  it('ignores any status, id or createdAt in the body: a new booking is always pending', async () => {
    const res = await partner(app).post('/api/bookings').send(newBooking({ status: 'confirmed' }));
    expect(res.status).toBe(400);
    expectErrorBody(res.body, 'Unknown field(s): status');
  });

  it('trims the event name and turns an offset into UTC with a Z and no milliseconds', async () => {
    const res = await partner(app)
      .post('/api/bookings')
      .send(newBooking({ eventName: '  Wedding  ', preferredStart: '2031-05-04T11:30:00.750+03:00' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ eventName: 'Wedding', preferredStart: '2031-05-04T08:30:00Z' });
    expect(res.body.preferredStart).toMatch(ISO_SECONDS);
  });

  it.each([
    ['no body at all', undefined, 'Request body must be a JSON object'],
    ['an empty object', {}, 'Missing required field(s): courseId, crewSize, preferredStart, eventName'],
    ['one field missing', { ...newBooking(), crewSize: undefined }, 'Missing required field(s): crewSize'],
    ['an unknown field', newBooking({ colour: 'green' }), 'Unknown field(s): colour'],
    ['crewSize 0', newBooking({ crewSize: 0 }), 'crewSize must be a whole number from 1 to 40'],
    ['crewSize 41', newBooking({ crewSize: 41 }), 'crewSize must be a whole number from 1 to 40'],
    ['crewSize 2.5', newBooking({ crewSize: 2.5 }), 'crewSize must be a whole number from 1 to 40'],
    ['crewSize as text', newBooking({ crewSize: '6' }), 'crewSize must be a whole number from 1 to 40'],
    ['a start in the past', newBooking({ preferredStart: '2020-01-01T08:00:00Z' }), /^preferredStart must be a future date-time, for example/],
    ['a start that is not a date', newBooking({ preferredStart: 'soon' }), /^preferredStart must be a future date-time/],
    ['30 February', newBooking({ preferredStart: '2031-02-30T08:00:00Z' }), /^preferredStart must be a future date-time/],
    ['a date with no time', newBooking({ preferredStart: '2031-05-04' }), /^preferredStart must be a future date-time/],
    ['an empty event name', newBooking({ eventName: '   ' }), 'eventName must be 1 to 120 characters'],
    ['a 121-character event name', newBooking({ eventName: 'x'.repeat(121) }), 'eventName must be 1 to 120 characters'],
    ['a courseId that is a number', newBooking({ courseId: 501 }), /^courseId must be a text id/],
  ])('answers 400 { message } and creates nothing for %s', async (_name, body, message) => {
    const res = body === undefined ? await partner(app).post('/api/bookings') : await partner(app).post('/api/bookings').send(body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
    expect((await get('bkg_6003')).status).toBe(404);
  });

  it.each([
    ['malformed JSON', '{"courseId":', 'Request body is not valid JSON'],
    ['a JSON list', '[]', 'Request body must be a JSON object'],
    ['JSON null', 'null', 'Request body must be a JSON object'],
    ['plain text', '"booking"', 'Request body must be a JSON object'],
  ])('answers 400 for %s', async (_name, raw, message) => {
    const res = await partner(app).post('/api/bookings').set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
  });

  it('answers 413 for a body over 20 KB, and creates nothing', async () => {
    const res = await partner(app).post('/api/bookings').send(newBooking({ eventName: 'x'.repeat(21_000) }));
    expect(res.status).toBe(413);
    expectErrorBody(res.body, 'Request body must be 20 KB or less');
    expect((await get('bkg_6003')).status).toBe(404);
  });

  it('answers 404 for a course that does not exist, and creates nothing', async () => {
    const res = await partner(app).post('/api/bookings').send(newBooking({ courseId: 'crs_999' }));
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Course crs_999 not found');
    expect((await get('bkg_6003')).status).toBe(404);
  });

  it('checks the body before the course: a bad body for an unknown course is 400, not 404', async () => {
    const res = await partner(app).post('/api/bookings').send(newBooking({ courseId: 'crs_999', crewSize: 0 }));
    expect(res.status).toBe(400);
  });

  it('answers 409 for a second pending booking of the same event, ignoring case, and creates nothing', async () => {
    await create();
    for (const eventName of ['Kamau family reunion', 'KAMAU FAMILY REUNION', '  kamau family reunion ']) {
      const res = await partner(app).post('/api/bookings').send(newBooking({ eventName }));
      expect(res.status).toBe(409);
      // The message repeats the event name the client sent (trimmed), not the stored spelling.
      expectErrorBody(res.body, `A pending booking named "${eventName.trim()}" already exists for course crs_501`);
    }
    expect((await get('bkg_6004')).status).toBe(404);
  });

  it('answers 409 for the seeded pending booking too, and allows the event on another course', async () => {
    const dup = await partner(app).post('/api/bookings').send(newBooking({ eventName: 'Wanjiku and Otieno wedding' }));
    expect(dup.status).toBe(409);
    const other = await partner(app).post('/api/bookings').send(newBooking({ courseId: 'crs_502', eventName: 'Wanjiku and Otieno wedding' }));
    expect(other.status).toBe(201);
  });

  it('allows the event again once the first booking is cancelled', async () => {
    const first = await create();
    expect((await partner(app).delete(`/api/bookings/${first.id}`)).status).toBe(204);
    expect((await partner(app).post('/api/bookings').send(newBooking())).status).toBe(201);
  });

  it('answers two simultaneous identical requests with one 201 and one 409', async () => {
    const [a, b] = await Promise.all([
      partner(app).post('/api/bookings').send(newBooking({ eventName: 'Race' })),
      partner(app).post('/api/bookings').send(newBooking({ eventName: 'Race' })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});

describe('PUT /api/bookings/{bookingId}', () => {
  const change = (over: Record<string, unknown> = {}) => ({ crewSize: 8, preferredStart: inDays(31), ...over });
  const put = (id: string, body: unknown) => partner(app).put(`/api/bookings/${id}`).send(body as object);

  it('replaces crew size and start date and answers the updated booking', async () => {
    const created = await create();
    const body = change();
    const res = await put(created.id, body);
    expect(res.status).toBe(200);
    expectBookingShape(res.body);
    expect(res.body).toEqual({ ...created, crewSize: 8, preferredStart: body.preferredStart });
    expect((await get(created.id)).body).toEqual(res.body);
  });

  it('is idempotent: the same body twice leaves the same booking and answers the same', async () => {
    const created = await create();
    const body = change();
    const first = await put(created.id, body);
    const second = await put(created.id, body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect((await get(created.id)).body).toEqual(first.body);
  });

  it.each([
    ['crewSize missing', { preferredStart: inDays(31) }, 'Missing required field(s): crewSize'],
    ['preferredStart missing', { crewSize: 8 }, 'Missing required field(s): preferredStart'],
    ['an event name (it cannot change)', { ...change(), eventName: 'Other' }, 'Unknown field(s): eventName'],
    ['a course (it cannot change)', { ...change(), courseId: 'crs_502' }, 'Unknown field(s): courseId'],
    ['crewSize 0', change({ crewSize: 0 }), 'crewSize must be a whole number from 1 to 40'],
    ['crewSize 41', change({ crewSize: 41 }), 'crewSize must be a whole number from 1 to 40'],
    ['a start in the past', change({ preferredStart: '2020-01-01T08:00:00Z' }), /^preferredStart must be a future date-time/],
  ])('answers 400 { message } and changes nothing for %s', async (_name, body, message) => {
    const created = await create();
    const res = await put(created.id, body);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
    expect((await get(created.id)).body).toEqual(created);
  });

  it('answers 400 for malformed JSON and 413 for an oversized body, changing nothing', async () => {
    const created = await create();
    const bad = await partner(app).put(`/api/bookings/${created.id}`).set('Content-Type', 'application/json').send('{"crewSize":');
    expect(bad.status).toBe(400);
    const big = await put(created.id, change({ padding: 'x'.repeat(21_000) }));
    expect(big.status).toBe(413);
    expect((await get(created.id)).body).toEqual(created);
  });

  it('answers 404 { message } for an unknown booking', async () => {
    const res = await put('bkg_9999', change());
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Booking bkg_9999 not found');
  });

  it('checks the body before the booking: a bad body for an unknown booking is 400', async () => {
    expect((await put('bkg_9999', change({ crewSize: 0 }))).status).toBe(400);
  });

  it('answers 409 for a confirmed booking and leaves it exactly as it was', async () => {
    const before = (await get('bkg_6002')).body;
    const res = await put('bkg_6002', change());
    expect(res.status).toBe(409);
    expectErrorBody(res.body, 'Booking bkg_6002 is confirmed; only pending bookings can be changed');
    expect((await get('bkg_6002')).body).toEqual(before);
  });

  it('answers 409 for a declined booking', async () => {
    const created = await create();
    await (await getStore()).decideBooking(created.id, 'declined');
    const res = await put(created.id, change());
    expect(res.status).toBe(409);
    expectErrorBody(res.body, `Booking ${created.id} is declined; only pending bookings can be changed`);
  });
});

describe('DELETE /api/bookings/{bookingId}', () => {
  const del = (id: string) => partner(app).delete(`/api/bookings/${id}`);

  it('cancels a pending booking: 204 with no body, and it no longer exists', async () => {
    const created = await create();
    const res = await del(created.id);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await get(created.id)).status).toBe(404);
  });

  it('answers 404 the second time: a cancelled booking is gone', async () => {
    const created = await create();
    await del(created.id);
    const again = await del(created.id);
    expect(again.status).toBe(404);
    expectErrorBody(again.body, `Booking ${created.id} not found`);
  });

  it('answers 404 { message } for an unknown booking', async () => {
    const res = await del('bkg_9999');
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Booking bkg_9999 not found');
  });

  it('answers 409 for a confirmed booking and leaves it in place', async () => {
    const before = (await get('bkg_6002')).body;
    const res = await del('bkg_6002');
    expect(res.status).toBe(409);
    expectErrorBody(res.body, 'Booking bkg_6002 is confirmed; only pending bookings can be cancelled');
    expect((await get('bkg_6002')).body).toEqual(before);
  });

  it('answers 409 for a declined booking', async () => {
    const created = await create();
    await (await getStore()).decideBooking(created.id, 'declined');
    const res = await del(created.id);
    expect(res.status).toBe(409);
    expectErrorBody(res.body, `Booking ${created.id} is declined; only pending bookings can be cancelled`);
  });
});
