import { createServer } from 'node:http';
import { SAMPLE_JOBS } from '../__tests__/helpers/kaziStub';

/**
 * A stand-in Kazi Connect that you control (Week 11, Part A): `npm run partner:flaky`. It answers GET /api/jobs
 * in Kazi's shape, with four modes you can switch without restarting:
 *
 *   curl http://localhost:4000/__mode/ok      answers at once
 *   curl http://localhost:4000/__mode/slow    answers after 10 seconds
 *   curl http://localhost:4000/__mode/flaky   fails (503) twice, then works, over and over
 *   curl http://localhost:4000/__mode/error   always fails (500)
 *
 * Stop it with Ctrl-C to see "partner down" (ECONNREFUSED). To point Ujuzi at it:
 *   KAZI_API_URL=http://localhost:4000 npm run dev      (the stand-in needs no key; it never prints one)
 *
 * It is a separate little program, not part of Ujuzi, and nothing in Ujuzi depends on it.
 */
const port = Number(process.env.PORT ?? 4000);
let mode: 'ok' | 'slow' | 'flaky' | 'error' = 'ok';
let calls = 0;

const send = (res: import('node:http').ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const switchTo = /^\/__mode\/(ok|slow|flaky|error)$/.exec(url.pathname)?.[1];
  if (switchTo) {
    mode = switchTo as typeof mode;
    calls = 0;
    return send(res, 200, { mode });
  }
  if (url.pathname !== '/api/jobs') return send(res, 404, { message: 'Not found' });

  calls += 1;
  console.log(`GET ${url.pathname} (call ${calls}, mode ${mode})`); // path only: no query, no headers
  if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 10_000));
  if (mode === 'flaky' && calls % 3 !== 0) return send(res, 503, { message: 'Try again' }); // fails twice, then works
  if (mode === 'error') return send(res, 500, { message: 'Internal error' });

  const status = url.searchParams.get('status');
  const county = url.searchParams.get('county')?.toLowerCase();
  const category = url.searchParams.get('category')?.toLowerCase();
  send(
    res,
    200,
    SAMPLE_JOBS.filter(
      (job) => (!status || job.status === status) && (!county || job.county.toLowerCase() === county) && (!category || job.category === category),
    ),
  );
}).listen(port, () => console.log(`Stand-in Kazi on http://localhost:${port} (mode ${mode})`));
