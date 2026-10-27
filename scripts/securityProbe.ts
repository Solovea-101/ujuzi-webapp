/**
 * `npm run security:probe`: attacks a running Ujuzi on the points of the Week 9 self-audit and prints what
 * it found. It needs a server with the in-memory sample data, a partner key, and rate limits that will not
 * get in the way:
 *
 *   PARTNER_KEYS=sherehe:$(printf %s probe-key | shasum -a 256 | cut -d' ' -f1),other:$(printf %s probe-key-2 | shasum -a 256 | cut -d' ' -f1) \
 *     RATE_LIMIT_ANON=100000 RATE_LIMIT_PARTNER=100000 RATE_LIMIT_LOGIN=100000 PORT=4907 npm start
 *   UJUZI_URL=http://localhost:4907 UJUZI_API_KEY=probe-key UJUZI_API_KEY_2=probe-key-2 npm run security:probe
 *
 * Each line is OK (the attack failed, as it should) or FINDING (something to read and decide on). It only
 * creates sample-data records in the in-memory server it is pointed at; do not run it against a deployment
 * that holds real data.
 */
const BASE = (process.env.UJUZI_URL ?? 'http://localhost:4907').replace(/\/+$/, '');
const KEY = process.env.UJUZI_API_KEY ?? '';
// A second partner's key (optional): with it the probe checks that one partner cannot reach another's bookings.
const KEY_2 = process.env.UJUZI_API_KEY_2 ?? '';
const PASSWORD = process.env.SEED_PASSWORD || 'ujuzi-demo-pass';

let findings = 0;
const ok = (label: string) => console.log(`OK       ${label}`);
const finding = (label: string, detail = '') => {
  findings += 1;
  console.log(`FINDING  ${label}${detail ? `  -> ${detail}` : ''}`);
};
const check = (label: string, good: boolean, detail = '') => (good ? ok(label) : finding(label, detail));
const section = (title: string) => console.log(`\n== ${title}`);

interface Answer {
  status: number;
  text: string;
  body: unknown;
  headers: Headers;
}

async function call(method: string, path: string, opts: { key?: string; token?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}): Promise<Answer> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.key) headers['X-API-Key'] = opts.key;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined || opts.raw !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  const text = await res.text();
  let body: unknown;
  try {
    body = text === '' ? undefined : JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: res.status, text, body, headers: res.headers };
}

const login = async (email: string): Promise<string> => {
  const res = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  return (res.body as { token: string }).token;
};
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Text that would tell an attacker how the server is built. */
const LEAKS = /(\bat [\w$.<>]+ \(|node_modules|\/Users\/|\.tsx?:\d+|SELECT |INSERT |UPDATE |pg_|relation "|syntax error|stack|ECONN|ENOENT|TypeError|ReferenceError|RangeError|scrypt\$|password_hash|token_hash|SESSION_SECRET|PARTNER_KEYS|DATABASE_URL)/i;

async function sensitiveFields(): Promise<void> {
  section('1. Sensitive fields: does any answer carry a hash, token, secret or personal detail it should not?');
  const achieng = await login('achieng.otieno@example.com');
  const staff = await login('wanjiru.njeri@example.com');
  const answers: Array<[string, Answer]> = [
    ['GET /api/courses (partner)', await call('GET', '/api/courses', { key: KEY })],
    ['GET /api/certificates/UJZ-2026-00123 (partner)', await call('GET', '/api/certificates/UJZ-2026-00123', { key: KEY })],
    ['GET /api/bookings/bkg_6001 (partner)', await call('GET', '/api/bookings/bkg_6001', { key: KEY })],
    ['GET /api/me (graduate)', await call('GET', '/api/me', { token: achieng })],
    ['GET /api/me/enrolments', await call('GET', '/api/me/enrolments', { token: achieng })],
    ['GET /api/bookings (staff)', await call('GET', '/api/bookings', { token: staff })],
    ['POST /api/auth/login', await call('POST', '/api/auth/login', { body: { email: 'achieng.otieno@example.com', password: PASSWORD } })],
    ['POST /api/auth/register', await call('POST', '/api/auth/register', { body: { role: 'graduate', email: `probe.${Date.now()}@example.com`, password: 'a long passphrase', firstName: 'Probe', lastName: 'Person' } })],
  ];
  for (const [label, res] of answers) {
    const forbidden = /scrypt\$|password_hash|passwordHash|token_hash|"password"|SESSION_SECRET|PARTNER_KEYS|DATABASE_URL/i.test(res.text);
    check(`${label}: no password hash, secret or database field`, !forbidden && res.status < 500, `status ${res.status}`);
  }
  const cert = answers[1][1].body as { holder?: string };
  check('the certificate check shows a first name and initial only, never a surname, email or id', /^\S+ [A-Z]\.$/.test(cert.holder ?? '') && !/@|grd_|enr_/.test(answers[1][1].text), cert.holder);
  const me = answers[3][1].body as Record<string, unknown>;
  check('GET /api/me returns only the contract\'s six fields', Object.keys(me).sort().join() === 'centreId,email,firstName,id,lastName,role', Object.keys(me).join());
  const partnerView = answers.filter(([label]) => label.includes('(partner)')).map(([, res]) => res.text).join('');
  check('partner answers never contain an email address', !/@/.test(partnerView));
}

async function otherPeoplesData(): Promise<void> {
  section('2. Other people\'s data: can changing an id reach a record that is not yours?');
  const achieng = await login('achieng.otieno@example.com');
  const brian = await login('brian.kamau@example.com');
  const westlands = await login('wanjiru.njeri@example.com');
  const hurlingham = await login('peter.mwangi@example.com');
  const mine = await call('POST', '/api/enrolments', { token: brian, body: { courseId: 'crs_503' } });
  check('setup: Brian enrols in a course', mine.status === 201);

  check('a graduate cannot list another graduate\'s enrolments (the list is always the caller\'s own)', !JSON.stringify((await call('GET', '/api/me/enrolments', { token: achieng })).body).includes('enr_0004'));
  check('a graduate cannot change or withdraw someone else\'s Kazi application: 404, as if it did not exist', (await call('DELETE', '/api/me/applications/app_1005', { token: achieng })).status === 404);
  check('staff of another centre cannot decide a booking: 403', (await call('PATCH', '/api/bookings/bkg_6001', { token: hurlingham, body: { status: 'confirmed' } })).status === 403);
  check('staff of another centre cannot edit a course: 403', (await call('PUT', '/api/courses/crs_501', { token: hurlingham, body: { title: 'x', category: 'events', durationWeeks: 1, feeKes: 0, nextStart: future(10), certificateLevel: 'short-course' } })).status === 403);
  check('staff of another centre cannot issue a certificate: 403', (await call('POST', '/api/certificates', { token: hurlingham, body: { enrolmentId: 'enr_0001' } })).status === 403);
  check('staff see only their own centre\'s bookings', !JSON.stringify((await call('GET', '/api/bookings', { token: hurlingham })).body).includes('bkg_6001'));
  check('a graduate cannot use the staff endpoints: 403', (await call('GET', '/api/bookings', { token: achieng })).status === 403);
  check('staff cannot use the graduate endpoints: 403', (await call('GET', '/api/me/enrolments', { token: westlands })).status === 403);
  check('a login token cannot use the partner-only endpoints: 401', (await call('GET', '/api/bookings/bkg_6001', { token: westlands })).status === 401);
  check('a partner key cannot use staff or graduate endpoints: 401', (await call('GET', '/api/bookings', { key: KEY })).status === 401 && (await call('GET', '/api/me', { key: KEY })).status === 401);
  if (KEY_2) {
    for (const [method, body] of [['GET', undefined], ['PUT', { crewSize: 3, preferredStart: future(30) }], ['DELETE', undefined]] as const) {
      const res = await call(method, '/api/bookings/bkg_6001', { key: KEY_2, body });
      check(`a second partner's key cannot ${method} the first partner's booking: 404`, res.status === 404, `status ${res.status}`);
    }
    check('the first partner still reads its booking, unchanged', (await call('GET', '/api/bookings/bkg_6001', { key: KEY })).status === 200);
    const mine = await call('POST', '/api/bookings', { key: KEY_2, body: { courseId: 'crs_501', crewSize: 2, preferredStart: future(40), eventName: `Probe ${Date.now()}` } });
    check('a booking made with the second key is invisible to the first (404)', mine.status === 201 && (await call('GET', `/api/bookings/${(mine.body as { id: string }).id}`, { key: KEY })).status === 404);
  } else {
    console.log('NOTE     UJUZI_API_KEY_2 is not set, so one partner reaching another partner\'s bookings was not tried.');
  }
}

async function errorMessages(): Promise<void> {
  section('3. Error messages: do failures reveal how the server is built?');
  const token = await login('achieng.otieno@example.com');
  const hugeNesting = '['.repeat(9000);
  const probes: Array<[string, () => Promise<Answer>]> = [
    ['an id with SQL in it', () => call('GET', `/api/courses/${encodeURIComponent("crs_501' OR '1'='1'; DROP TABLE courses;--")}`, { key: KEY })],
    ['a query value with SQL in it', () => call('GET', `/api/courses?county=${encodeURIComponent("Nairobi' OR 1=1--")}`, { key: KEY })],
    ['broken percent-encoding in the path', () => call('GET', '/api/courses/%E0%A4%A', { key: KEY })],
    ['a null byte in the path', () => call('GET', '/api/courses/crs_501%00', { key: KEY })],
    ['a 5,000-character id', () => call('GET', `/api/bookings/${'x'.repeat(5000)}`, { key: KEY })],
    ['a body that is not JSON', () => call('POST', '/api/bookings', { key: KEY, raw: '{"courseId":' })],
    ['JSON nested 9,000 levels deep', () => call('POST', '/api/bookings', { key: KEY, raw: hugeNesting })],
    ['a number too big for JSON', () => call('POST', '/api/bookings', { key: KEY, raw: '{"courseId":"crs_501","crewSize":1e999,"preferredStart":"2031-01-01T00:00:00Z","eventName":"x"}' })],
    ['a body of 30 KB', () => call('POST', '/api/bookings', { key: KEY, raw: JSON.stringify({ x: 'y'.repeat(30_000) }) })],
    ['a method the route does not have', () => call('PUT', '/api/courses', { key: KEY, body: {} })],
    ['an unknown API path', () => call('GET', '/api/does/not/exist', { key: KEY })],
    ['an unknown API path with a trailing dot-dot', () => call('GET', '/api/../etc/passwd', { key: KEY })],
    ['a malformed bearer token', () => call('GET', '/api/me', { headers: { Authorization: 'Bearer ' + 'z'.repeat(500) } })],
    ['a job id with markup in it', () => call('POST', '/api/me/applications', { token, body: { jobId: '<script>alert(1)</script>', preferredDate: future(30) } })],
  ];
  for (const [label, run] of probes) {
    const res = await run();
    const leaks = LEAKS.test(res.text);
    check(`${label}: status ${res.status}, nothing that reveals the server`, !leaks && res.status < 500, leaks ? res.text.slice(0, 120) : `status ${res.status}`);
  }
  const wrongMethod = await call('PUT', '/api/courses', { key: KEY, body: {} });
  check('a method a route does not have: 405 with a { message } body', wrongMethod.status === 405 && typeof (wrongMethod.body as { message?: string } | undefined)?.message === 'string', `status ${wrongMethod.status} body ${wrongMethod.text.slice(0, 60)}`);
  const odd = await call('GET', '/api/courses/crs_501', { key: KEY });
  check('answers carry no X-Powered-By or server version header', !odd.headers.get('x-powered-by') && !/\d+\.\d+/.test(odd.headers.get('server') ?? ''), `x-powered-by=${odd.headers.get('x-powered-by')} server=${odd.headers.get('server')}`);
  check('API answers say Cache-Control: no-store', odd.headers.get('cache-control') === 'no-store', String(odd.headers.get('cache-control')));
  check('X-Content-Type-Options: nosniff is sent', odd.headers.get('x-content-type-options') === 'nosniff');
}

async function passwordGuessing(): Promise<void> {
  section('5. Password guessing: is it slowed, and does the lock say who has an account?');
  const wrong = (email: string) => call('POST', '/api/auth/login', { body: { email, password: 'definitely-wrong' } });
  const target = `lock.${Date.now()}@example.com`;
  const ghost = `ghost.${Date.now()}@example.com`;
  await call('POST', '/api/auth/register', { body: { role: 'graduate', email: target, password: 'a long passphrase', firstName: 'Lock', lastName: 'Test' } });
  const seen = (rows: Answer[]) => rows.map((r) => r.status).join(',');
  const real: Answer[] = [];
  const none: Answer[] = [];
  for (let i = 0; i < 7; i++) {
    real.push(await wrong(target));
    none.push(await wrong(ghost));
  }
  check('after 5 wrong passwords the account is locked (401 x5, then 429)', seen(real) === '401,401,401,401,401,429,429', seen(real));
  check('an email with no account is locked the same way, so the lock says nothing about who is registered', seen(none) === seen(real), seen(none));
  const locked = await call('POST', '/api/auth/login', { body: { email: target, password: 'a long passphrase' } });
  check('the right password does not get past the lock, and Retry-After says how long', locked.status === 429 && Number(locked.headers.get('retry-after')) > 0, `status ${locked.status}`);
  check('the lock message is the same for both', real[6].text === none[6].text, `${real[6].text} / ${none[6].text}`);
}

async function writeEndpoints(): Promise<void> {
  section('4. Write endpoints: can a caller send an extra field and have it saved?');
  const westlands = await login('wanjiru.njeri@example.com');
  const achieng = await login('achieng.otieno@example.com');
  const extra = async (label: string, run: () => Promise<Answer>) => {
    const res = await run();
    check(`${label}: refused with 400 "Unknown field(s)"`, res.status === 400 && /Unknown field/.test(res.text), `status ${res.status} ${res.text.slice(0, 80)}`);
  };
  await extra('POST /api/bookings with status and id', () => call('POST', '/api/bookings', { key: KEY, body: { courseId: 'crs_501', crewSize: 2, preferredStart: future(30), eventName: 'Mass assignment', status: 'confirmed', id: 'bkg_1' } }));
  await extra('PUT /api/bookings with eventName', () => call('PUT', '/api/bookings/bkg_6001', { key: KEY, body: { crewSize: 3, preferredStart: future(30), eventName: 'Renamed' } }));
  await extra('POST /api/courses with centreId (choosing another centre)', () => call('POST', '/api/courses', { token: westlands, body: { title: 'x', category: 'events', durationWeeks: 1, feeKes: 0, nextStart: future(30), certificateLevel: 'short-course', centreId: 'cen_12' } }));
  await extra('POST /api/me/applications with studentId (acting as someone else)', () => call('POST', '/api/me/applications', { token: achieng, body: { jobId: 'job_1', preferredDate: future(30), studentId: 'grd_0102' } }));
  await extra('POST /api/auth/register with an id', () => call('POST', '/api/auth/register', { body: { role: 'graduate', email: 'mass1@example.com', password: 'a long passphrase', firstName: 'A', lastName: 'B', id: 'usr_9999' } }));
  await extra('POST /api/auth/register with isAdmin', () => call('POST', '/api/auth/register', { body: { role: 'graduate', email: 'mass2@example.com', password: 'a long passphrase', firstName: 'A', lastName: 'B', isAdmin: true } }));
  await extra('POST /api/auth/register with a __proto__ key (prototype pollution)', () => call('POST', '/api/auth/register', { raw: '{"role":"graduate","email":"mass3@example.com","password":"a long passphrase","firstName":"A","lastName":"B","__proto__":{"role":"staff"}}' }));
  const staffSignUp = await call('POST', '/api/auth/register', { body: { role: 'staff', email: 'mass4@example.com', password: 'a long passphrase', firstName: 'A', lastName: 'B', centreId: 'cen_11', inviteCode: 'guess' } });
  check('a self-registered "staff" account is refused without the invite code (403)', staffSignUp.status === 403, `status ${staffSignUp.status}`);
  const polluted = await call('GET', '/api/me', { token: achieng });
  check('the earlier __proto__ attempt changed nothing for other requests', (polluted.body as { role?: string }).role === 'graduate');
}

async function main(): Promise<void> {
  if (!KEY) throw new Error('Set UJUZI_API_KEY to the partner key the server was started with.');
  console.log(`Security probe against ${BASE}`);
  await sensitiveFields();
  await otherPeoplesData();
  await errorMessages();
  await passwordGuessing();
  await writeEndpoints();
  console.log(findings === 0 ? '\nsecurity:probe: nothing to fix (read the NOTE lines too)' : `\nsecurity:probe: ${findings} FINDING(S) to read`);
  process.exit(findings === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
