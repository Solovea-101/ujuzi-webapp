import request from 'supertest';
import { startServer, type TestServer } from './helpers/server';

let app: TestServer;
beforeAll(async () => {
  app = await startServer();
});
afterAll(() => app.close());

// The pages are client components, so the server sends their first render: the heading and the loading
// state. What they do after that (log in, fetch, show a feed) calls the same API the other tests cover.
describe('the website\'s pages', () => {
  it.each([
    ['/', 'Ujuzi'],
    ['/login', 'Log in'],
    ['/register', 'Create your account'],
    ['/courses/crs_501', 'Course'],
    ['/my-courses', 'My courses'],
    ['/my-applications', 'My applications'],
    ['/staff', 'Centre staff'],
    ['/docs', 'Ujuzi API'],
  ])('%s answers 200 as HTML with its heading', async (path, heading) => {
    const res = await request(app.server).get(path);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain(heading);
    expect(res.text).toContain('<nav'); // every page has the navigation
  });

  it('needs no key or login to be served: the pages log people in themselves', async () => {
    expect((await request(app.server).get('/login')).status).toBe(200);
  });

  it('links to the API docs and keeps the API itself on /api', async () => {
    const home = await request(app.server).get('/');
    expect(home.text).toContain('href="/docs"');
    expect((await request(app.server).get('/api/courses')).status).toBe(401); // the API is not shadowed by a page
  });

  it('leaks nothing from the server environment into a page', async () => {
    const text = (await request(app.server).get('/')).text + (await request(app.server).get('/staff')).text;
    for (const secret of ['PARTNER_KEYS', 'SESSION_SECRET', 'DATABASE_URL', 'scrypt$']) expect(text).not.toContain(secret);
  });
});
