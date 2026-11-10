/**
 * Sends a random mix of requests to a running Ujuzi, to give the logs and GET /api/stats something to show
 * (Week 12, Part D). Reads only: the one write it sends has an empty body, so Ujuzi refuses it with a 400 and
 * nothing is created.
 *
 *   API=http://localhost:4003 KEY=<your-partner-key> npm run traffic
 *   N=200 PAUSE_MS=700 ...            more requests, slower (a partner key may make 100 a minute)
 *
 * Needs the key Ujuzi issued to you. It is read from KEY and is never printed.
 *
 * TARGET=kazi sends a mix of Kazi Connect's read endpoints instead (our upstream: jobs, one job, a missing job,
 * no key, a path that does not exist), for the partner-side traffic check, with the key Kazi issued to Ujuzi.
 * At the end it prints how many requests of each kind it sent, so the partner can compare with its own count.
 */
export {}; // a module, so its names stay its own

const API = (process.env.API ?? 'http://localhost:3000').replace(/\/+$/, '');
const KEY = process.env.KEY;
const N = Number(process.env.N ?? 60);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 50);

if (!KEY) {
  console.error('Set KEY to the partner key you were issued: KEY=... npm run traffic');
  process.exit(1);
}

interface Probe {
  method: string;
  path: string;
  key: boolean;
  body?: unknown;
}

const kaziMix: Probe[] = [
  { method: 'GET', path: '/api/jobs?status=active', key: true },
  { method: 'GET', path: '/api/jobs?status=active', key: true },
  { method: 'GET', path: '/api/jobs?status=active&county=Nairobi&category=catering', key: true },
  { method: 'GET', path: '/api/jobs/job_12348', key: true },
  { method: 'GET', path: '/api/jobs/job_12348/status', key: true },
  { method: 'GET', path: '/api/jobs/job_99999', key: true }, // no such job: 404
  { method: 'GET', path: '/api/jobs?status=active', key: false }, // no key at all: 401
  { method: 'GET', path: '/api/not-a-route', key: true }, // no such path: 404
];

const ujuziMix: Probe[] = [
  { method: 'GET', path: '/api/courses', key: true },
  { method: 'GET', path: '/api/courses', key: true },
  { method: 'GET', path: '/api/courses?county=Nairobi&category=catering', key: true },
  { method: 'GET', path: '/api/courses/crs_501', key: true },
  { method: 'GET', path: '/api/courses/crs_9999', key: true }, // no such course: 404
  { method: 'GET', path: '/api/certificates/UJZ-2026-00123', key: true },
  { method: 'GET', path: '/api/certificates/UJZ-0000-00000', key: true }, // no such certificate: 404
  { method: 'GET', path: '/api/courses', key: false }, // no key at all: 401
  { method: 'GET', path: '/api/not-a-route', key: true }, // no such path: 404
  { method: 'POST', path: '/api/bookings', key: true, body: {} }, // invalid on purpose: 400, nothing created
];

const mix = process.env.TARGET === 'kazi' ? kaziMix : ujuziMix;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const counts: Record<string, number> = {};
  const sent: Record<string, number> = {};
  const began = new Date().toISOString();
  for (let i = 0; i < N; i++) {
    const r = mix[Math.floor(Math.random() * mix.length)];
    const kind = `${r.method} ${r.path.split('?')[0].replace(/job_\d+/, 'job_N')}${r.key ? '' : ' (no key)'}`;
    sent[kind] = (sent[kind] ?? 0) + 1;
    try {
      const res = await fetch(API + r.path, {
        method: r.method,
        headers: { ...(r.key ? { 'X-API-Key': KEY! } : {}), ...(r.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: r.body !== undefined ? JSON.stringify(r.body) : undefined,
      });
      counts[res.status] = (counts[res.status] ?? 0) + 1;
    } catch {
      counts.failed = (counts.failed ?? 0) + 1;
    }
    await pause(PAUSE_MS);
  }
  console.log('Status codes received:', counts);
  console.log('Sent, by kind:', sent);
  console.log(`Started ${began}, finished ${new Date().toISOString()} (${N} requests, ${PAUSE_MS} ms apart)`);
}

void main();
