export {}; // a module, so its names stay its own

/**
 * The Week 11 drill, against a running Ujuzi and the stand-in partner (`npm run partner:flaky`):
 *
 *   KAZI_CACHE_MS=1 KAZI_API_URL=http://localhost:4000 PORT=4412 npm start          (Ujuzi, in one terminal)
 *   UJUZI=http://localhost:4412 PARTNER=http://localhost:4000 npm run drill:resilience
 *
 * For each way the partner can fail it asks Ujuzi for a course's job matches (a graduate logs in with the
 * sample account) and prints what a person would have seen and how long they waited. The short KAZI_CACHE_MS
 * makes every question go to the partner, so the stand-in's mode is really tested.
 *
 * The first slow and error steps are asked BEFORE any good answer was saved, so they show the friendly
 * failure message; the "saved copy" steps come after a good answer. Run it against a freshly started Ujuzi to
 * see that order. Nothing is printed that could hold a key or a token.
 */
const UJUZI = (process.env.UJUZI ?? 'http://localhost:4412').replace(/\/+$/, '');
const PARTNER = (process.env.PARTNER ?? 'http://localhost:4000').replace(/\/+$/, '');
const PASSWORD = process.env.SEED_PASSWORD ?? 'ujuzi-demo-pass';
const COURSE = process.env.COURSE ?? 'crs_501';

const setMode = async (mode: string) => void (await fetch(`${PARTNER}/__mode/${mode}`));

async function login(): Promise<string> {
  const res = await fetch(`${UJUZI}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'achieng.otieno@example.com', password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Could not log in to ${UJUZI} (${res.status}). Is it running, with sample data?`);
  return ((await res.json()) as { token: string }).token;
}

async function ask(token: string, what: string): Promise<void> {
  const started = Date.now();
  const res = await fetch(`${UJUZI}/api/courses/${COURSE}/job-matches`, { headers: { Authorization: `Bearer ${token}` } });
  const body: unknown = await res.json().catch(() => undefined);
  const seconds = ((Date.now() - started) / 1000).toFixed(2);
  const shown = Array.isArray(body)
    ? `${body.length} jobs`
    : `message="${(body as { message?: string } | undefined)?.message ?? '(no body)'}"`;
  const saved = res.headers.get('x-data-stale') === 'true' ? `, SAVED COPY from ${res.headers.get('x-data-as-of')}` : '';
  console.log(`${what.padEnd(46)} HTTP ${res.status}  ${shown}${saved}  (${seconds} s)`);
}

async function main(): Promise<void> {
  const token = await login();
  console.log(`Ujuzi ${UJUZI}, partner stand-in ${PARTNER}\n`);
  await setMode('slow');
  await ask(token, 'slow, nothing saved yet (answers after 10 s)');
  await setMode('error');
  await ask(token, 'error, nothing saved yet (always 500)');
  await setMode('ok');
  await ask(token, 'ok (a good answer is now saved)');
  await setMode('flaky');
  for (let i = 1; i <= 3; i++) await ask(token, `flaky #${i} (fails twice, then works)`);
  await setMode('error');
  await ask(token, 'error, with a saved copy');
  await setMode('slow');
  await ask(token, 'slow, with a saved copy');
  await setMode('ok');
  await ask(token, 'ok again: live data is back');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
