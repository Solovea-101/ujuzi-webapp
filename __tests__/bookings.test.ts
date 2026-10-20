import request from 'supertest';
import { startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys, ISO_SECONDS } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

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

// Only the GET is built so far; POST, PUT, DELETE and PATCH are the Week 6 write phase.
describe('GET /api/bookings/{bookingId}', () => {
  it('returns the pending booking from the contract example', async () => {
    const res = await request(app.server).get('/api/bookings/bkg_6001');
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
    const res = await request(app.server).get('/api/bookings/bkg_6002');
    expect(res.status).toBe(200);
    expectBookingShape(res.body);
    expect(res.body.status).toBe('confirmed');
  });

  it('answers 404 { message } for an unknown id', async () => {
    const res = await request(app.server).get('/api/bookings/bkg_9999');
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Booking bkg_9999 not found');
  });
});
