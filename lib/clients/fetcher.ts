/**
 * The generic half of talking to Kazi Connect: timeouts, careful retries, a short cache for job reads that
 * keeps the last good answer for when Kazi cannot be reached, and sorting every way a call can fail into our
 * own error kinds. It knows nothing about Kazi's paths or fields; that is kaziClient.ts.
 */
import { kaziMetrics, noteKaziFailure } from './kaziMetrics';
import { failureReason, fetchWithRetry } from './resilientFetch';

/** "user": someone is waiting for the answer. "background": a poller or subscriber that can be patient. */
export type Mode = 'user' | 'background';

/** Kazi could not be reached, was too slow, or answered with something we cannot use. Becomes our own 502. */
export class KaziUnavailableError extends Error {
  name = 'KaziUnavailableError';
}

/** Kazi said we are sending too many requests (429). Carries how long it asked us to wait. */
export class KaziRateLimitedError extends KaziUnavailableError {
  name = 'KaziUnavailableError'; // answered like any other "Kazi unavailable": our own 502
  readonly rateLimited = true;
  constructor(readonly retryAfterMs: number) {
    super('Kazi Connect asked us to slow down');
  }
}

/** Kazi understood the request and said no: 400, 404 or 409. Carries Kazi's own message if it sent one. */
export class KaziRejectedError extends Error {
  name = 'KaziRejectedError';
  constructor(
    readonly status: 400 | 404 | 409,
    readonly kaziMessage?: string,
  ) {
    super(kaziMessage ?? `Kazi Connect answered ${status}`);
  }
}

// Next compiles each route into its own bundle, each with its own copy of these classes, so errors are
// recognised by name (as with the store's errors).
export const isKaziUnavailable = (err: unknown): err is KaziUnavailableError =>
  err instanceof Error && err.name === 'KaziUnavailableError';
export const isKaziRateLimited = (err: unknown): err is KaziRateLimitedError =>
  err instanceof Error && (err as { rateLimited?: boolean }).rateLimited === true;
export const isKaziRejected = (err: unknown): err is KaziRejectedError =>
  err instanceof Error && err.name === 'KaziRejectedError';

/** Kazi's 429 → how many milliseconds to wait: its Retry-After (seconds), at least 1 s and at most 5 minutes. */
export function retryAfterMs(value: string | null | undefined): number {
  const seconds = Number(value);
  return Math.min(300, Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 1) * 1000;
}

/**
 * Our key for Kazi, when Kazi has keys switched on (KAZI_API_KEY, in Render's settings, never in git). Left
 * unset, nothing is sent, which is what Kazi's open endpoints expect. Sent on every HTTP call and on the
 * WebSocket upgrade.
 */
export function kaziKeyHeaders(): Record<string, string> {
  const key = process.env.KAZI_API_KEY?.trim();
  return key ? { 'X-API-Key': key } : {};
}

// A wrong or missing key is the same mistake on every call, so it is said once a minute, not on every one.
const noted = globalThis as typeof globalThis & { __ujuziKaziKeyNoted?: number };
export function noteKeyRefused(): void {
  const now = Date.now();
  if (noted.__ujuziKaziKeyNoted && now - noted.__ujuziKaziKeyNoted < 60_000) return;
  noted.__ujuziKaziKeyNoted = now;
  console.error(
    process.env.KAZI_API_KEY
      ? 'Kazi Connect refused our API key (401): check KAZI_API_KEY. Not retrying in a loop.'
      : 'Kazi Connect wants an API key (401) and KAZI_API_KEY is not set.',
  );
}

// Tuning, read on every call so a test (or an operator) can change it without a restart. Defaults are
// the ones CLAUDE.md fixes: 10 s when a user waits, 60 s in the background, a 5 minute cache for job reads.
// For a read that a person waits on, 10 s is the whole budget; it is spent in attempts of at most 3 s each
// (live Kazi answers in 0.5 to 2 s when awake, so 3 s is not cut short) with at most 2 retries after waits of
// 200 ms and 400 ms: worst case 3 x 3000 + 200 + 400 = 9600 ms, inside the budget. See RESILIENCE_NOTES.md.
const number = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const wholeNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
};
export const timeoutMs = (mode: Mode) =>
  mode === 'user' ? number('KAZI_USER_TIMEOUT_MS', 10_000) : number('KAZI_BACKGROUND_TIMEOUT_MS', 60_000);
export const attemptTimeoutMs = () => number('KAZI_ATTEMPT_TIMEOUT_MS', 3_000);
export const retryCount = () => wholeNumber('KAZI_RETRIES', 2);
export const retryDelayMs = () => wholeNumber('KAZI_RETRY_DELAY_MS', 200);
export const cacheMs = () => number('KAZI_CACHE_MS', 5 * 60_000);
/** How long the last good job list may still be shown, flagged as saved, when Kazi cannot be reached. */
export const staleMs = () => number('KAZI_STALE_MS', 60 * 60_000);

export interface KaziAnswer {
  status: number;
  /** The parsed JSON body, or undefined when Kazi sent none (its read endpoints send nothing on 400 and 404). */
  body: unknown;
  headers: Headers;
}

/** The path of a Kazi URL, for the log. Never the query (it can carry what a person searched for) and never a header. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '(bad url)';
  }
}

/**
 * One call to Kazi. Any answer below 500 is returned for the caller to read; a network error, a
 * timeout, a 5xx, or a body that is not JSON all throw KaziUnavailableError. A read that a person waits on is
 * retried (see resilientFetch.ts); a write or a background poll makes one patient attempt, because a retried
 * write could happen twice and a poller tries again at its next turn anyway. Every failure is logged with its
 * cause (timeout, ECONNREFUSED, HTTP 503) and counted, and the log never holds the key.
 */
export async function fetchKazi(
  url: string,
  init: { method?: string; body?: unknown; mode: Mode },
): Promise<KaziAnswer> {
  const method = (init.method ?? 'GET').toUpperCase();
  const path = pathOf(url);
  const metrics = kaziMetrics();
  metrics.calls += 1;

  const single = init.mode === 'background' || method !== 'GET';
  const attempts = single
    ? { timeoutMs: timeoutMs(init.mode), retries: 0, delayMs: 0 }
    : { timeoutMs: attemptTimeoutMs(), retries: retryCount(), delayMs: retryDelayMs(), budgetMs: timeoutMs('user') };

  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      {
        method,
        headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...kaziKeyHeaders() },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      },
      {
        ...attempts,
        onRetry: ({ attempt, attempts: of, waitMs, reason }) => {
          metrics.retries += 1;
          console.warn(`kazi ${method} ${path}: attempt ${attempt} of ${of} failed (${reason}), retrying in ${waitMs} ms`);
        },
      },
    );
  } catch (err) {
    const reason = failureReason(err);
    noteKaziFailure(reason);
    console.error(`kazi ${method} ${path} failed: ${reason}`);
    throw new KaziUnavailableError(reason === 'timeout' ? 'Kazi Connect did not answer in time' : 'Kazi Connect could not be reached');
  }
  if (res.status >= 500) {
    noteKaziFailure(`HTTP ${res.status}`);
    console.error(`kazi ${method} ${path} failed: HTTP ${res.status}`);
    throw new KaziUnavailableError(`Kazi Connect answered ${res.status}`);
  }
  // Checked before anything else: Kazi's 401 and 429 carry a JSON body, unlike its empty 400 and 404.
  if (res.status === 401) {
    noteKaziFailure('HTTP 401');
    noteKeyRefused(); // said once a minute, with its own wording
    throw new KaziUnavailableError('Kazi Connect did not accept our API key');
  }
  if (res.status === 429) {
    metrics.rateLimited += 1;
    throw new KaziRateLimitedError(retryAfterMs(res.headers.get('retry-after')));
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new KaziUnavailableError('Kazi Connect stopped answering part way');
  }
  if (text === '') return { status: res.status, body: undefined, headers: res.headers };
  try {
    return { status: res.status, body: JSON.parse(text), headers: res.headers };
  } catch {
    throw new KaziUnavailableError('Kazi Connect answered something that is not JSON');
  }
}

// ---- The job cache ----------------------------------------------------------------------------------
// On globalThis because route bundles each get their own copy of this module. It lives in memory, so a
// restart clears it: saved data never outlives the server.
interface Entry {
  /** Fresh until this time (ms). After it the entry is kept only as the last good answer. */
  expires: number;
  /** When Kazi last gave us this answer (ms). */
  storedAt: number;
  value: unknown;
}
const shared = globalThis as typeof globalThis & { __ujuziKaziCache?: Map<string, Entry> };
const cache = () => (shared.__ujuziKaziCache ??= new Map());

/** An answer, whether it is saved data (Kazi could not be reached), and when Kazi gave it: UTC, no milliseconds. */
export interface Remembered<T> {
  value: T;
  stale: boolean;
  asOf: string;
}
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * A fresh cached answer, or a new one from `load`. When `load` fails because Kazi is unavailable, the last good
 * answer is returned instead, flagged stale with the time it was saved, for up to KAZI_STALE_MS. With nothing
 * saved the failure goes on up to the caller. A failure is never cached, and a rejection (400, 404, 409) is a
 * real answer, never covered up with old data.
 */
export async function cachedOrStale<T>(key: string, load: () => Promise<T>): Promise<Remembered<T>> {
  const now = Date.now();
  const hit = cache().get(key);
  if (hit && hit.expires > now) return { value: hit.value as T, stale: false, asOf: iso(hit.storedAt) };
  try {
    const value = await load();
    const entries = cache();
    for (const [other, entry] of entries) if (now - entry.storedAt > staleMs()) entries.delete(other); // nothing is kept for ever
    entries.set(key, { expires: now + cacheMs(), storedAt: now, value });
    return { value, stale: false, asOf: iso(now) };
  } catch (err) {
    if (isKaziUnavailable(err) && hit && now - hit.storedAt <= staleMs()) {
      kaziMetrics().staleServed += 1;
      console.warn(`kazi data served from saved copy (saved ${iso(hit.storedAt)}): ${err.message}`);
      return { value: hit.value as T, stale: true, asOf: iso(hit.storedAt) };
    }
    throw err;
  }
}

export function clearKaziCache(): void {
  cache().clear();
}
