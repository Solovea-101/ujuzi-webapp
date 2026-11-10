import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { hashKey, partnerForKey } from '@/lib/auth/partnerKey';
import { kaziMetrics } from '@/lib/clients/kaziMetrics';

/**
 * Monitoring (Week 12): one JSON line per API request, and running totals for GET /api/stats.
 *
 * What is logged: time, method, path (never the query string), status, response time in milliseconds, and a
 * label for who called. What is NEVER logged: an API key or token (not even part of one), a password, a
 * request or response body, a query string. The caller is "key-xxxxxx" (the first six characters of the
 * SHA-256 of a valid partner key, so partners can be told apart and nobody can get the key back), "bad-key"
 * (a key that matched nothing), "login" (a website login token was sent; it is not checked here) or "none".
 *
 * monitor() runs first in server.ts, before the rate limit and every key check, so a rejected request (401,
 * 429, a bad URL) is logged too. The totals are in memory: they restart from zero with the server and would
 * be wrong across several server copies. That is fine here; a bigger deployment would send them to a shared tool.
 */

// ---- Who called -------------------------------------------------------------------------------------------

export interface Caller {
  /** key-xxxxxx, bad-key, login or none: what goes in the log and the counts. */
  label: string;
  /** The partner's name (from PARTNER_KEYS) for a valid key; the name is configuration, not a secret. */
  partner?: string;
}

export function callerOf(headers: IncomingHttpHeaders): Caller {
  const key = headers['x-api-key'];
  if (typeof key === 'string' && key !== '') {
    const partner = partnerForKey(key);
    return partner ? { label: `key-${hashKey(key).slice(0, 6)}`, partner } : { label: 'bad-key' };
  }
  return { label: headers.authorization ? 'login' : 'none' };
}

// ---- Which route ------------------------------------------------------------------------------------------

/**
 * The route patterns of our API, written as in openapi.yaml. A request is counted under its pattern, so
 * /api/bookings/bkg_6001 and /api/bookings/bkg_6002 are one row, GET /api/bookings/{bookingId}, and the list
 * of routes can never grow with the ids callers send. __tests__/monitoring.test.ts checks this list against
 * openapi.yaml, so a new endpoint cannot be forgotten.
 */
export const ROUTE_TEMPLATES = [
  '/api/courses',
  '/api/courses/{courseId}',
  '/api/courses/{courseId}/job-matches',
  '/api/certificates',
  '/api/certificates/{certificateNo}',
  '/api/bookings',
  '/api/bookings/{bookingId}',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/password',
  '/api/me',
  '/api/enrolments',
  '/api/me/enrolments',
  '/api/me/applications',
  '/api/me/applications/feed',
  '/api/me/applications/{id}',
  '/api/stats',
] as const;

const compiled = ROUTE_TEMPLATES.map((template) => ({ template, parts: template.split('/') })).sort(
  (a, b) => a.parts.filter((p) => p.startsWith('{')).length - b.parts.filter((p) => p.startsWith('{')).length, // fixed words win over {ids}
);

/** The pattern a path belongs to, or undefined (a path no route has: a 404). */
export function templateFor(pathname: string): string | undefined {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const parts = trimmed.split('/');
  return compiled.find((c) => c.parts.length === parts.length && c.parts.every((p, i) => (p.startsWith('{') ? parts[i] !== '' : p === parts[i])))?.template;
}

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/** "GET /api/bookings/{bookingId}", or "GET (no route)" when no route has that path. A made-up method is OTHER. */
export function routeLabel(method: string, pathname: string): string {
  return `${METHODS.has(method) ? method : 'OTHER'} ${templateFor(pathname) ?? '(no route)'}`;
}

// ---- The totals -------------------------------------------------------------------------------------------

interface RouteStats {
  count: number;
  clientErrors: number;
  serverErrors: number;
  totalMs: number;
  maxMs: number;
}

interface Stats {
  startedAt: string;
  total: number;
  clientErrors: number;
  serverErrors: number;
  totalMs: number;
  routes: Record<string, RouteStats>;
  callers: Record<string, number>;
  statuses: Record<string, number>;
}

const fresh = (): Stats => ({ startedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), total: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, routes: {}, callers: {}, statuses: {} });

// On globalThis: server.ts (which records) and the /api/stats route (which reads) are separate bundles.
const shared = globalThis as typeof globalThis & { __ujuziStats?: Stats };
const stats = (): Stats => (shared.__ujuziStats ??= fresh());

/** Back to zero. For tests. */
export function resetStats(): void {
  shared.__ujuziStats = fresh();
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Counts one finished request. Every list here is bounded: routes by the table above, callers by the keys we issued. */
export function recordRequest(r: { method: string; path: string; status: number; ms: number; caller: string }): void {
  const s = stats();
  const label = routeLabel(r.method, r.path);
  const route = (s.routes[label] ??= { count: 0, clientErrors: 0, serverErrors: 0, totalMs: 0, maxMs: 0 });
  s.total += 1;
  s.totalMs += r.ms;
  route.count += 1;
  route.totalMs += r.ms;
  route.maxMs = Math.max(route.maxMs, r.ms);
  if (r.status >= 500) {
    s.serverErrors += 1;
    route.serverErrors += 1;
  } else if (r.status >= 400) {
    s.clientErrors += 1;
    route.clientErrors += 1;
  }
  s.callers[r.caller] = (s.callers[r.caller] ?? 0) + 1;
  s.statuses[String(r.status)] = (s.statuses[String(r.status)] ?? 0) + 1;
}

/** What GET /api/stats answers. */
export function statsSnapshot() {
  const s = stats();
  const routes: Record<string, { count: number; clientErrors: number; serverErrors: number; avgMs: number; maxMs: number }> = {};
  for (const [label, r] of Object.entries(s.routes)) {
    routes[label] = { count: r.count, clientErrors: r.clientErrors, serverErrors: r.serverErrors, avgMs: round(r.totalMs / r.count), maxMs: round(r.maxMs) };
  }
  return {
    startedAt: s.startedAt,
    uptimeSeconds: Math.round(process.uptime()),
    total: s.total,
    clientErrors: s.clientErrors,
    serverErrors: s.serverErrors,
    // Only 5xx counts: a 4xx is usually the caller's mistake, a 5xx is ours.
    errorRatePercent: s.total ? round((s.serverErrors / s.total) * 100) : 0,
    avgMs: s.total ? round(s.totalMs / s.total) : 0,
    statuses: s.statuses,
    callers: s.callers,
    routes,
    // The link to Kazi Connect (Week 11): how often it fails, is retried, or is covered by a saved copy.
    kazi: { ...kaziMetrics(), failuresByReason: { ...kaziMetrics().failuresByReason } },
  };
}

// ---- The request log --------------------------------------------------------------------------------------

const MAX_LOGGED_PATH = 200;

/** The path of a request URL, exactly as sent (not decoded) and without the query string. */
export function pathOfUrl(url: string | undefined): string {
  const raw = url ?? '/';
  const end = raw.search(/[?#]/);
  return end === -1 ? raw : raw.slice(0, end);
}

const logging = () => process.env.LOG_REQUESTS !== 'false' && !(process.env.NODE_ENV === 'test' && process.env.LOG_REQUESTS !== 'true');

/**
 * Watches one request: when its response has been sent, it is counted and logged as one JSON line. Only /api
 * is watched (pages and assets would drown the log). Call it first, before anything can answer or reject.
 */
export function monitor(req: IncomingMessage, res: ServerResponse): void {
  const path = pathOfUrl(req.url);
  if (path !== '/api' && !path.startsWith('/api/')) return;
  const start = process.hrtime.bigint(); // a precise clock, so quick requests do not read as 0 ms
  res.on('finish', () => {
    const ms = round(Number(process.hrtime.bigint() - start) / 1e6);
    const method = req.method ?? 'GET';
    const caller = callerOf(req.headers);
    recordRequest({ method, path, status: res.statusCode, ms, caller: caller.label });
    if (logging()) {
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          method,
          path: path.length > MAX_LOGGED_PATH ? `${path.slice(0, MAX_LOGGED_PATH)}…` : path, // no query string, ever
          status: res.statusCode,
          ms,
          caller: caller.label,
          ...(caller.partner ? { partner: caller.partner } : {}),
        }),
      );
    }
  });
}
