import { WebSocket } from 'ws';
import type { components } from '../types/kazi';
import { schemaProblems } from './kaziSchema';

/**
 * `npm run ring:check`: one end-to-end look at Ujuzi's place in the ring Sherehe -> Kazi Connect -> Ujuzi -> Sherehe.
 *
 *   1. Kazi:   one live read (GET /api/jobs?status=active), checked against Kazi's contract and types/kazi.d.ts.
 *   2. Kazi:   opens one WebSocket, hears the status, closes it, and withdraws the application it made.
 *   3. Ujuzi:  calls its own partner endpoints (S1 to S5) on its deployment with the partner key, and checks
 *              that they refuse a call without one.
 *   4. Ujuzi -> Kazi: logs in as a seeded graduate, reads job matches, applies, and withdraws.
 *
 * Settings come from the environment (the ring's env files use these names):
 *   KAZI_API_URL, KAZI_WS_URL            Kazi Connect (default http://localhost:4002, ws://localhost:4002)
 *   UJUZI_API_URL, UJUZI_API_KEY         Ujuzi and the partner key issued to Sherehe (default http://localhost:4003)
 *   RING_GRADUATE_EMAIL / _PASSWORD      a seeded demo graduate (default achieng.otieno@example.com / ujuzi-demo-pass)
 * Everything it creates it removes again. Exit code 1 when anything fails; a SKIP is not a failure.
 */

type KaziJob = components['schemas']['Job'];

const KAZI = (process.env.KAZI_API_URL ?? 'http://localhost:4002').replace(/\/+$/, '');
// Set when Kazi Connect has API keys switched on; sent only to Kazi, never to Ujuzi.
const KAZI_KEY: Record<string, string> = process.env.KAZI_API_KEY ? { 'X-API-Key': process.env.KAZI_API_KEY } : {};
const KAZI_WS = (process.env.KAZI_WS_URL ?? KAZI.replace(/^http/, 'ws')).replace(/\/+$/, '');
const UJUZI = (process.env.UJUZI_API_URL ?? process.env.UJUZI_URL ?? 'http://localhost:4003').replace(/\/+$/, '');
const KEY = process.env.UJUZI_API_KEY ?? '';
const EMAIL = process.env.RING_GRADUATE_EMAIL ?? 'achieng.otieno@example.com';
const PASSWORD = process.env.RING_GRADUATE_PASSWORD ?? 'ujuzi-demo-pass';

let failures = 0;
const report = (state: 'PASS' | 'FAIL' | 'SKIP', label: string, detail = '') => {
  if (state === 'FAIL') failures += 1;
  console.log(`${state.padEnd(4)} ${label}${detail ? `  (${detail})` : ''}`);
};
const check = (label: string, ok: boolean, detail = '') => report(ok ? 'PASS' : 'FAIL', label, detail);

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

interface Answer {
  status: number;
  body: unknown;
}

async function call(base: string, method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Answer> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(base === KAZI ? KAZI_KEY : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90_000), // a sleeping Render server can take a minute
  });
  const text = await res.text();
  try {
    return { status: res.status, body: text === '' ? undefined : JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// ---- 1 and 2: Kazi Connect --------------------------------------------------------------------------

async function checkKazi(): Promise<KaziJob | undefined> {
  console.log(`\nKazi Connect at ${KAZI}`);
  let first: KaziJob | undefined;
  try {
    const jobs = await call(KAZI, 'GET', '/api/jobs?status=active');
    const list = Array.isArray(jobs.body) ? (jobs.body as KaziJob[]) : [];
    check('live read: GET /api/jobs?status=active answers 200 with jobs', jobs.status === 200 && list.length > 0, `${list.length} jobs`);
    const bad = list.flatMap((job) => schemaProblems('Job', job)).slice(0, 3);
    check('every job matches Kazi\'s contract (types/kazi.d.ts Job)', bad.length === 0, bad.join('; '));
    first = list[0];
  } catch (err) {
    report('FAIL', 'live read from Kazi', (err as Error).message);
    return undefined;
  }
  if (!first) return undefined;

  let applicationId: string | undefined;
  try {
    const created = await call(KAZI, 'POST', '/api/applications', {}, { jobId: first.id, studentId: 'grd_ringcheck', preferredDate: future(30) });
    applicationId = isObject(created.body) ? String(created.body.applicationId) : undefined;
    check('POST /api/applications creates a pending application', created.status === 201 && schemaProblems('Application', created.body).length === 0, `${applicationId}`);
    if (applicationId) {
      const ws = new WebSocket(`${KAZI_WS}/api/applications/${applicationId}/subscribe`, { headers: KAZI_KEY });
      const first = await new Promise<unknown>((resolve, reject) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
        ws.once('error', reject);
        setTimeout(() => reject(new Error('no message within 10 s')), 10_000);
      });
      check('WebSocket opens and sends the current status', schemaProblems('ApplicationStatus', first).length === 0 && isObject(first) && first.status === 'pending', JSON.stringify(first));
      const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
      ws.close(1000); // a normal closure, with its status code, so the other side sees 1000 and not 1005 (none)
      check('WebSocket closes cleanly', (await closed) === 1000);
    }
  } catch (err) {
    report('FAIL', 'application and WebSocket at Kazi', (err as Error).message);
  } finally {
    if (applicationId) {
      const gone = await call(KAZI, 'DELETE', `/api/applications/${applicationId}`).catch(() => undefined);
      check('the application it made is withdrawn again', gone?.status === 204);
    }
  }
  return first;
}

// ---- 3: Ujuzi's partner endpoints ---------------------------------------------------------------------

async function checkUjuzi(): Promise<void> {
  console.log(`\nUjuzi at ${UJUZI} (the partner API Sherehe calls)`);
  if (!KEY) return report('FAIL', 'UJUZI_API_KEY is not set', 'export the partner key (the ring keeps it in env/sherehe.env as UJUZI_API_KEY)');
  const auth = { 'X-API-Key': KEY };
  try {
    check('refuses a call with no key (401)', (await call(UJUZI, 'GET', '/api/courses')).status === 401);
    const courses = await call(UJUZI, 'GET', '/api/courses?category=catering&county=Nairobi', auth);
    const list = Array.isArray(courses.body) ? (courses.body as Array<Record<string, unknown>>) : [];
    check('S1: GET /api/courses with the key answers 200', courses.status === 200, `${list.length} catering courses in Nairobi`);
    const id = String(list[0]?.id ?? 'crs_501');
    check('S1: GET /api/courses/{id}', (await call(UJUZI, 'GET', `/api/courses/${id}`, auth)).status === 200, id);
    const cert = await call(UJUZI, 'GET', '/api/certificates/UJZ-2026-00123', auth);
    if (cert.status === 404) report('SKIP', 'S2: certificate UJZ-2026-00123', 'not in this database (not seeded)');
    else check('S2: GET /api/certificates/{no}', cert.status === 200 && isObject(cert.body) && typeof cert.body.valid === 'boolean', JSON.stringify(cert.body).slice(0, 90));

    const booking = { courseId: id, crewSize: 4, preferredStart: future(30), eventName: `Ring check ${Date.now()}` };
    const made = await call(UJUZI, 'POST', '/api/bookings', auth, booking);
    const bookingId = isObject(made.body) ? String(made.body.id) : '';
    check('S3: POST /api/bookings answers 201, pending', made.status === 201 && isObject(made.body) && made.body.status === 'pending', bookingId);
    if (made.status === 201) {
      check('S4: GET /api/bookings/{id}', (await call(UJUZI, 'GET', `/api/bookings/${bookingId}`, auth)).status === 200);
      const changed = await call(UJUZI, 'PUT', `/api/bookings/${bookingId}`, auth, { crewSize: 6, preferredStart: future(31) });
      check('S5: PUT /api/bookings/{id} changes it', changed.status === 200 && isObject(changed.body) && changed.body.crewSize === 6);
      check('S5: DELETE /api/bookings/{id} answers 204', (await call(UJUZI, 'DELETE', `/api/bookings/${bookingId}`, auth)).status === 204);
      check('a cancelled booking is gone (404)', (await call(UJUZI, 'GET', `/api/bookings/${bookingId}`, auth)).status === 404);
    }
  } catch (err) {
    report('FAIL', 'Ujuzi partner endpoints', (err as Error).message);
  }
}

// ---- 4: Ujuzi reading Kazi ----------------------------------------------------------------------------

async function checkUjuziToKazi(): Promise<void> {
  console.log('\nUjuzi -> Kazi Connect (a graduate through Ujuzi)');
  let applicationId: string | undefined;
  let headers: Record<string, string> = {};
  try {
    const login = await call(UJUZI, 'POST', '/api/auth/login', {}, { email: EMAIL, password: PASSWORD });
    if (login.status !== 200 || !isObject(login.body)) return report('SKIP', `login as ${EMAIL}`, `answered ${login.status}; set RING_GRADUATE_EMAIL and RING_GRADUATE_PASSWORD for a graduate that exists`);
    headers = { Authorization: `Bearer ${String(login.body.token)}` };
    const matches = await call(UJUZI, 'GET', '/api/courses/crs_501/job-matches', headers);
    const jobs = Array.isArray(matches.body) ? (matches.body as Array<Record<string, unknown>>) : [];
    check('job matches come from Kazi through Ujuzi', matches.status === 200 && jobs.length > 0, matches.status === 502 ? 'Ujuzi answered 502: Kazi unreachable from Ujuzi' : `${jobs.length} matches`);
    if (!jobs[0]) return;
    const applied = await call(UJUZI, 'POST', '/api/me/applications', headers, { jobId: jobs[0].jobId, preferredDate: future(30), note: 'ring:check (withdrawn again)' });
    applicationId = isObject(applied.body) ? String(applied.body.applicationId) : undefined;
    check('applying through Ujuzi creates it at Kazi', applied.status === 201 && Boolean(applicationId), `${applicationId}`);
    if (applicationId) {
      const atKazi = await call(KAZI, 'GET', `/api/applications/${applicationId}/status`);
      check('Kazi has it, pending', atKazi.status === 200 && isObject(atKazi.body) && atKazi.body.status === 'pending');
    }
  } catch (err) {
    report('FAIL', 'Ujuzi -> Kazi', (err as Error).message);
  } finally {
    if (applicationId) {
      const gone = await call(UJUZI, 'DELETE', `/api/me/applications/${applicationId}`, headers).catch(() => undefined);
      check('withdrawn again through Ujuzi (204)', gone?.status === 204);
    }
  }
}

async function main(): Promise<void> {
  console.log('Ring check: Sherehe -> Kazi Connect -> Ujuzi -> Sherehe (this run covers Kazi and Ujuzi)');
  await checkKazi();
  await checkUjuzi();
  await checkUjuziToKazi();
  console.log(failures === 0 ? '\nring:check: OK' : `\nring:check: ${failures} check(s) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
