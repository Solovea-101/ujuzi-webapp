import request from 'supertest';
import { CATEGORIES } from '@/lib/db/types';
import { KENYA_COUNTIES } from '@/lib/validation';
import { startServer, type TestServer } from './helpers/server';
import { expectErrorBody, expectKeys, ISO_SECONDS } from './helpers/shapes';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

const ids = (body: Array<{ id: string }>) => body.map((c) => c.id);

function expectCourseShape(course: Record<string, unknown>) {
  expectKeys(course, ['id', 'title', 'category', 'centre', 'county', 'area', 'durationWeeks', 'feeKes', 'nextStart', 'certificateLevel']);
  expectKeys(course.centre, ['id', 'name']);
  expect(course.id).toMatch(/^crs_\d+$/);
  expect((course.centre as { id: string }).id).toMatch(/^cen_\d+$/);
  expect(typeof course.title).toBe('string');
  expect(CATEGORIES).toContain(course.category);
  expect(KENYA_COUNTIES).toContain(course.county);
  expect(typeof course.area).toBe('string');
  expect(Number.isInteger(course.durationWeeks)).toBe(true);
  expect(Number.isInteger(course.feeKes)).toBe(true);
  expect(course.nextStart).toMatch(ISO_SECONDS);
  expect(['short-course', 'grade-III', 'grade-II', 'grade-I']).toContain(course.certificateLevel);
}

describe('GET /api/courses', () => {
  it('lists every course as a bare array with the contract shape', async () => {
    const res = await request(app.server).get('/api/courses');
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/json');
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(9);
    res.body.forEach(expectCourseShape);
  });

  it('returns the contract example course exactly', async () => {
    const res = await request(app.server).get('/api/courses');
    expect(res.body[0]).toEqual({
      id: 'crs_501',
      title: 'Food hygiene and event service',
      category: 'catering',
      centre: { id: 'cen_11', name: 'Westlands Skills Centre' },
      county: 'Nairobi',
      area: 'Westlands',
      durationWeeks: 2,
      feeKes: 3500,
      nextStart: '2026-11-23T07:00:00Z',
      certificateLevel: 'short-course',
    });
  });

  it('filters by category', async () => {
    const res = await request(app.server).get('/api/courses?category=catering');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(['crs_501']);
  });

  it.each([
    ['Nairobi', ['crs_501', 'crs_502', 'crs_503', 'crs_504']],
    ['kiambu', ['crs_505', 'crs_506', 'crs_507']],
    ['MOMBASA', ['crs_508', 'crs_509']],
  ])('filters by county %s, ignoring case, and answers the official spelling', async (county, expected) => {
    const res = await request(app.server).get(`/api/courses?county=${county}`);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(expected);
    for (const course of res.body) expect(course.county).toBe(KENYA_COUNTIES.find((c) => c.toLowerCase() === county.toLowerCase()));
  });

  it('combines category and county', async () => {
    const res = await request(app.server).get('/api/courses?category=plumbing&county=Nairobi');
    expect(ids(res.body)).toEqual(['crs_503']);
  });

  it('answers [] with 200 when nothing matches, including a real county with no courses', async () => {
    for (const query of ['category=plumbing&county=Mombasa', 'county=Lamu']) {
      const res = await request(app.server).get(`/api/courses?${query}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    }
  });

  it.each([
    ['an unknown category', 'category=cooking', /category must be one of accommodation, campus/],
    ['a category in the wrong case', 'category=Catering', /category must be one of/],
    ['an empty category', 'category=', /category must be one of/],
    ['an unknown county', 'county=Narnia', /county must be one of Kenya's 47 counties/],
    ['an empty county', 'county=', /county must be one of Kenya's 47 counties/],
    ['a category given twice', 'category=catering&category=events', /category may only be given once/],
  ])('answers 400 { message } for %s', async (_name, query, message) => {
    const res = await request(app.server).get(`/api/courses?${query}`);
    expect(res.status).toBe(400);
    expectErrorBody(res.body, message);
  });

  it('ignores a query parameter it does not know', async () => {
    const res = await request(app.server).get('/api/courses?colour=green');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(9);
  });
});

describe('GET /api/courses/{courseId}', () => {
  it('returns one course with the contract shape', async () => {
    const res = await request(app.server).get('/api/courses/crs_503');
    expect(res.status).toBe(200);
    expectCourseShape(res.body);
    expect(res.body).toMatchObject({ id: 'crs_503', category: 'plumbing', county: 'Nairobi', area: 'Hurlingham', certificateLevel: 'grade-III' });
  });

  it('answers 404 { message } for an unknown id', async () => {
    const res = await request(app.server).get('/api/courses/crs_999');
    expect(res.status).toBe(404);
    expectErrorBody(res.body, 'Course crs_999 not found');
  });

  it('answers 404, not a crash, for an id that is not even shaped like ours', async () => {
    const res = await request(app.server).get('/api/courses/' + encodeURIComponent("1'; DROP TABLE courses;--"));
    expect(res.status).toBe(404);
    expectErrorBody(res.body);
  });
});
