import request from 'supertest';
import { startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

describe('GET /api/certificates/{certificateNo}', () => {
  it('returns the contract example exactly', async () => {
    const res = await request(app.server).get('/api/certificates/UJZ-2026-00123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      certificateNo: 'UJZ-2026-00123',
      valid: true,
      courseTitle: 'Food hygiene and event service',
      level: 'short-course',
      issuedOn: '2026-08-14',
      holder: 'Achieng O.',
    });
    expectKeys(res.body, ['certificateNo', 'valid', 'courseTitle', 'level', 'issuedOn', 'holder']);
  });

  it('answers 200 with valid: false for a revoked certificate', async () => {
    const res = await request(app.server).get('/api/certificates/UJZ-2026-00124');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ certificateNo: 'UJZ-2026-00124', valid: false, holder: 'Brian K.' });
  });

  it('shows the holder as first name and initial only: no surname, email or id', async () => {
    const res = await request(app.server).get('/api/certificates/UJZ-2026-00124');
    const text = JSON.stringify(res.body);
    expect(res.body.holder).toMatch(/^\S+ [A-Z]\.$/);
    for (const secret of ['Kamau', 'example.com', 'grd_', 'enr_', 'password']) expect(text).not.toContain(secret);
  });

  it('answers 404 { message } for a well-formed number that does not exist', async () => {
    const res = await request(app.server).get('/api/certificates/UJZ-2026-99999');
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Certificate UJZ-2026-99999 not found');
  });

  it.each([
    ['letters', 'abc'],
    ['a short year', 'UJZ-26-00123'],
    ['too many digits', 'UJZ-2026-001234'],
    ['too few digits', 'UJZ-2026-0123'],
    ['lower case', 'ujz-2026-00123'],
    ['a wrong prefix', 'XYZ-2026-00123'],
  ])('answers 400 { message } for a malformed number (%s)', async (_name, number) => {
    const res = await request(app.server).get(`/api/certificates/${number}`);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, 'certificateNo must look like UJZ-2026-00123');
  });
});
