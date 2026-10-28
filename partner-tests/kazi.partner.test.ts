import { WebSocket } from 'ws';
import { schemaProblems } from '../scripts/kaziSchema';

/**
 * Ujuzi's tests of Kazi Connect, written ONLY from Kazi's contract (partner-tests/kazi_openapi.yaml): never
 * from its code or its own tests. They cover endpoints 1 to 9, the ones Ujuzi uses, none of which need a
 * login. Run them with: KAZI_URL=http://localhost:4002 npm run test:partner
 *
 * Every application a test creates is withdrawn in afterAll, so the listings are left as they were. Not
 * covered, because they need an employer login: accepting an application, and the 409 for changing or
 * withdrawing one that is no longer pending.
 */
const BASE = (process.env.KAZI_URL ?? process.env.KAZI_API_URL ?? 'https://kaziconnect1-1xmu.onrender.com').replace(/\/+$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
// Only needed when Kazi Connect has API keys switched on (KAZI_API_KEY); the contract's ApiKey scheme is X-API-Key.
const KEY_HEADER: Record<string, string> = process.env.KAZI_API_KEY ? { 'X-API-Key': process.env.KAZI_API_KEY } : {};
const STUDENT = 'grd_partner_test'; // fictional: a Ujuzi-style id, never real data

jest.setTimeout(90_000); // the first call to a sleeping Render server can take a minute

const created: string[] = [];
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

interface Answer {
  status: number;
  text: string;
  body: unknown;
  headers: Headers;
}

async function call(method: string, path: string, body?: unknown, raw?: string): Promise<Answer> {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...KEY_HEADER },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? undefined : JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return { status: res.status, text, body: parsed, headers: res.headers };
}

async function newApplication(jobId: string, extra: Record<string, unknown> = {}): Promise<Answer> {
  const answer = await call('POST', '/api/applications', { jobId, studentId: STUDENT, preferredDate: future(30), ...extra });
  if (answer.status === 201) created.push((answer.body as { applicationId: string }).applicationId);
  return answer;
}

let activeJob: { id: string; county: string; category: string };
let closedJob: { id: string } | undefined;

beforeAll(async () => {
  const active = await call('GET', '/api/jobs?status=active');
  const jobs = active.body as Array<{ id: string; county: string; category: string }>;
  if (active.status !== 200 || !Array.isArray(jobs) || jobs.length === 0) {
    throw new Error(`These tests need at least one active job at ${BASE}; GET /api/jobs?status=active answered ${active.status}`);
  }
  activeJob = jobs[0];
  const closed = await call('GET', '/api/jobs?status=closed');
  closedJob = Array.isArray(closed.body) ? (closed.body as Array<{ id: string }>)[0] : undefined;
});

afterAll(async () => {
  for (const id of created) await call('DELETE', `/api/applications/${id}`); // 404 is fine: already withdrawn
});

describe('Endpoints 1 and 2: GET /api/jobs', () => {
  it('lists active jobs, each matching the contract\'s Job', async () => {
    const res = await call('GET', '/api/jobs?status=active');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const jobs = res.body as unknown[];
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(schemaProblems('Job', job)).toEqual([]);
      expect((job as { status: string }).status).toBe('active');
    }
  });

  it('lists closed jobs when asked for them, and none of them is active', async () => {
    const res = await call('GET', '/api/jobs?status=closed');
    expect(res.status).toBe(200);
    for (const job of res.body as Array<{ status: string }>) expect(job.status).toBe('closed');
  });

  it('filters by county and category, ignoring upper and lower case', async () => {
    const county = activeJob.county;
    const category = activeJob.category;
    const lower = await call('GET', `/api/jobs?status=active&county=${encodeURIComponent(county.toLowerCase())}&category=${category.toUpperCase()}`);
    expect(lower.status).toBe(200);
    const jobs = lower.body as Array<{ id: string; county: string; category: string }>;
    expect(jobs.map((j) => j.id)).toContain(activeJob.id);
    for (const job of jobs) {
      expect(job.county.toLowerCase()).toBe(county.toLowerCase());
      expect(job.category.toLowerCase()).toBe(category.toLowerCase());
    }
  });

  it('answers an empty list, not an error, when nothing matches', async () => {
    const res = await call('GET', '/api/jobs?status=active&county=Atlantis');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each([
    ['a missing status', '/api/jobs'],
    ['an empty county', '/api/jobs?status=active&county='],
    ['an empty category', '/api/jobs?status=active&category='],
  ])('answers 400 with an EMPTY body for %s (the quirk Ujuzi relies on)', async (_name, path) => {
    const res = await call('GET', path);
    expect(res.status).toBe(400);
    expect(res.text).toBe('');
  });
});

describe('Endpoints 3 and 4: one job and its status', () => {
  it('returns one job, matching the contract', async () => {
    const res = await call('GET', `/api/jobs/${activeJob.id}`);
    expect(res.status).toBe(200);
    expect(schemaProblems('Job', res.body)).toEqual([]);
    expect((res.body as { id: string }).id).toBe(activeJob.id);
  });

  it('returns the job\'s status', async () => {
    const res = await call('GET', `/api/jobs/${activeJob.id}/status`);
    expect(res.status).toBe(200);
    expect(schemaProblems('JobStatus', res.body)).toEqual([]);
    expect(res.body).toEqual({ jobId: activeJob.id, status: 'active' });
  });

  it('answers 404 with an EMPTY body for an unknown job, for both', async () => {
    for (const path of ['/api/jobs/job_does_not_exist', '/api/jobs/job_does_not_exist/status']) {
      const res = await call('GET', path);
      expect([path, res.status, res.text]).toEqual([path, 404, '']);
    }
  });
});

describe('Endpoint 7: POST /api/applications', () => {
  it('creates a pending application: 201, a Location header, and the contract\'s Application', async () => {
    const res = await newApplication(activeJob.id, { note: 'Partner test' });
    expect(res.status).toBe(201);
    expect(schemaProblems('Application', res.body)).toEqual([]);
    const app = res.body as { applicationId: string; jobId: string; studentId: string; note: string; status: string };
    expect(app).toMatchObject({ jobId: activeJob.id, studentId: STUDENT, note: 'Partner test', status: 'pending' });
    expect(res.headers.get('location')).toContain(app.applicationId);
  });

  it('answers an empty note when none is sent', async () => {
    const res = await newApplication(activeJob.id);
    expect((res.body as { note: string }).note).toBe('');
  });

  it('is not idempotent: the same body twice makes two applications', async () => {
    const a = await newApplication(activeJob.id);
    const b = await newApplication(activeJob.id);
    expect((a.body as { applicationId: string }).applicationId).not.toBe((b.body as { applicationId: string }).applicationId);
  });

  it.each([
    ['no body', undefined],
    ['an empty object', {}],
    ['a missing preferredDate', { jobId: 'x', studentId: STUDENT }],
    ['an unknown field', { jobId: 'x', studentId: STUDENT, preferredDate: future(30), colour: 'green' }],
    ['a date in the past', { jobId: 'x', studentId: STUDENT, preferredDate: '2020-01-01T09:00:00Z' }],
    ['a date that is not a date', { jobId: 'x', studentId: STUDENT, preferredDate: 'soon' }],
    ['an empty studentId', { jobId: 'x', studentId: '', preferredDate: future(30) }],
    ['a note over 500 characters', { jobId: 'x', studentId: STUDENT, preferredDate: future(30), note: 'n'.repeat(501) }],
    ['a jobId that matches no job', { jobId: 'job_does_not_exist', studentId: STUDENT, preferredDate: future(30) }],
  ])('answers 400 { message } for %s and creates nothing', async (_name, body) => {
    const input = body && (body as { jobId?: string }).jobId === 'x' ? { ...body, jobId: activeJob.id } : body;
    const res = body === undefined ? await call('POST', '/api/applications') : await call('POST', '/api/applications', input);
    if (res.status === 201) created.push((res.body as { applicationId: string }).applicationId);
    expect(res.status).toBe(400);
    expect(schemaProblems('Error', res.body)).toEqual([]);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const res = await call('POST', '/api/applications', undefined, '{"jobId":');
    expect(res.status).toBe(400);
  });

  it('answers 409 { message } for a job that is closed', async () => {
    if (!closedJob) return console.warn('No closed job to test the 409 with; skipped');
    const res = await newApplication(closedJob.id);
    expect(res.status).toBe(409);
    expect(schemaProblems('Error', res.body)).toEqual([]);
  });
});

describe('Endpoint 5: GET /api/applications/{id}/status', () => {
  it('reads the status of a new application: pending', async () => {
    const app = (await newApplication(activeJob.id)).body as { applicationId: string };
    const res = await call('GET', `/api/applications/${app.applicationId}/status`);
    expect(res.status).toBe(200);
    expect(schemaProblems('ApplicationStatus', res.body)).toEqual([]);
    expect(res.body).toEqual({ applicationId: app.applicationId, status: 'pending' });
  });

  it('answers 404 with an EMPTY body for an unknown application', async () => {
    const res = await call('GET', '/api/applications/app_does_not_exist/status');
    expect(res.status).toBe(404);
    expect(res.text).toBe('');
  });
});

describe('Endpoint 8: PUT /api/applications/{id}', () => {
  it('reschedules a pending application, and sending the same body twice leaves the same state', async () => {
    const app = (await newApplication(activeJob.id, { note: 'before' })).body as { applicationId: string };
    const change = { preferredDate: future(45), note: 'after' };
    const first = await call('PUT', `/api/applications/${app.applicationId}`, change);
    const second = await call('PUT', `/api/applications/${app.applicationId}`, change);
    expect(first.status).toBe(200);
    expect(schemaProblems('Application', first.body)).toEqual([]);
    expect(first.body).toMatchObject({ applicationId: app.applicationId, preferredDate: change.preferredDate, note: 'after', status: 'pending' });
    expect(second.body).toEqual(first.body);
  });

  it('clears the note when it is left out (it sets an absolute state)', async () => {
    const app = (await newApplication(activeJob.id, { note: 'to be cleared' })).body as { applicationId: string };
    const res = await call('PUT', `/api/applications/${app.applicationId}`, { preferredDate: future(46) });
    expect((res.body as { note: string }).note).toBe('');
  });

  it('answers 404 { message } for an unknown application, and creates nothing', async () => {
    const res = await call('PUT', '/api/applications/app_does_not_exist', { preferredDate: future(45) });
    expect(res.status).toBe(404);
    expect(schemaProblems('Error', res.body)).toEqual([]);
    expect((await call('GET', '/api/applications/app_does_not_exist/status')).status).toBe(404);
  });

  it.each([
    ['a date in the past', { preferredDate: '2020-01-01T09:00:00Z' }],
    ['no date', {}],
    ['an unknown field', { preferredDate: future(45), jobId: 'other' }],
  ])('answers 400 { message } for %s and changes nothing', async (_name, body) => {
    const app = (await newApplication(activeJob.id)).body as { applicationId: string; preferredDate: string };
    const res = await call('PUT', `/api/applications/${app.applicationId}`, body);
    expect(res.status).toBe(400);
    expect(schemaProblems('Error', res.body)).toEqual([]);
    const still = await call('PUT', `/api/applications/${app.applicationId}`, { preferredDate: app.preferredDate });
    expect((still.body as { preferredDate: string }).preferredDate).toBe(app.preferredDate);
  });
});

describe('Endpoint 9: DELETE /api/applications/{id}', () => {
  it('withdraws a pending application: 204 with no body, then its status answers 404', async () => {
    const app = (await newApplication(activeJob.id)).body as { applicationId: string };
    const res = await call('DELETE', `/api/applications/${app.applicationId}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await call('GET', `/api/applications/${app.applicationId}/status`)).status).toBe(404);
  });

  it('answers 404 { message } the second time, and for an application that never existed', async () => {
    const app = (await newApplication(activeJob.id)).body as { applicationId: string };
    await call('DELETE', `/api/applications/${app.applicationId}`);
    for (const id of [app.applicationId, 'app_does_not_exist']) {
      const res = await call('DELETE', `/api/applications/${id}`);
      expect(res.status).toBe(404);
      expect(schemaProblems('Error', res.body)).toEqual([]);
    }
  });
});

describe('Endpoint 6: the WebSocket /api/applications/{id}/subscribe', () => {
  const connect = (id: string) => new WebSocket(`${WS_BASE}/api/applications/${id}/subscribe`, { headers: KEY_HEADER });

  it('sends the current status once on connect', async () => {
    const app = (await newApplication(activeJob.id)).body as { applicationId: string };
    const ws = connect(app.applicationId);
    const first = await new Promise<unknown>((resolve, reject) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      ws.once('error', reject);
    });
    ws.close();
    expect(schemaProblems('ApplicationStatus', first)).toEqual([]);
    expect(first).toEqual({ applicationId: app.applicationId, status: 'pending' });
  });

  it('sends "cancelled" once when the application is withdrawn, then closes the socket with code 1000', async () => {
    const app = (await newApplication(activeJob.id)).body as { applicationId: string };
    const ws = connect(app.applicationId);
    const messages: unknown[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
    await new Promise((resolve) => setTimeout(resolve, 300)); // the initial status
    const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
    expect((await call('DELETE', `/api/applications/${app.applicationId}`)).status).toBe(204);
    expect(await closed).toBe(1000);
    expect(messages).toEqual([
      { applicationId: app.applicationId, status: 'pending' },
      { applicationId: app.applicationId, status: 'cancelled' },
    ]);
  });

  it('refuses the upgrade (404) for an application that does not exist', async () => {
    const ws = connect('app_does_not_exist');
    const outcome = await new Promise<string>((resolve) => {
      ws.once('unexpected-response', (_req, res) => resolve(`HTTP ${res.statusCode}`));
      ws.once('open', () => resolve('opened'));
      ws.once('error', () => resolve('error'));
    });
    ws.terminate();
    expect(outcome).toBe('HTTP 404');
  });

  it('answers 426 to a plain HTTP GET', async () => {
    const app = (await newApplication(activeJob.id)).body as { applicationId: string };
    expect((await call('GET', `/api/applications/${app.applicationId}/subscribe`)).status).toBe(426);
  });
});
