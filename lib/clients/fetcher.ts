/**
 * The generic half of talking to Kazi Connect: timeouts, a short cache for job reads, and sorting every
 * way a call can fail into our own error kinds. It knows nothing about Kazi's paths or fields; that is
 * kaziClient.ts.
 */

/** "user": someone is waiting for the answer. "background": a poller or subscriber that can be patient. */
export type Mode = 'user' | 'background';

/** Kazi could not be reached, was too slow, or answered with something we cannot use. Becomes our own 502. */
export class KaziUnavailableError extends Error {
  name = 'KaziUnavailableError';
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
export const isKaziRejected = (err: unknown): err is KaziRejectedError =>
  err instanceof Error && err.name === 'KaziRejectedError';

// Tuning, read on every call so a test (or an operator) can change it without a restart. Defaults are
// the ones CLAUDE.md fixes: 10 s when a user waits, 60 s in the background, a 5 minute cache for job reads.
const number = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
export const timeoutMs = (mode: Mode) =>
  mode === 'user' ? number('KAZI_USER_TIMEOUT_MS', 10_000) : number('KAZI_BACKGROUND_TIMEOUT_MS', 60_000);
export const cacheMs = () => number('KAZI_CACHE_MS', 5 * 60_000);

export interface KaziAnswer {
  status: number;
  /** The parsed JSON body, or undefined when Kazi sent none (its read endpoints send nothing on 400 and 404). */
  body: unknown;
  headers: Headers;
}

/**
 * One call to Kazi. Any answer below 500 is returned for the caller to read; a network error, a
 * timeout, a 5xx, or a body that is not JSON all throw KaziUnavailableError.
 */
export async function fetchKazi(
  url: string,
  init: { method?: string; body?: unknown; mode: Mode },
): Promise<KaziAnswer> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs(init.mode)),
    });
  } catch (err) {
    // By name, not instanceof: the abort error can come from another JavaScript realm (as under Jest).
    const name = (err as { name?: string } | null)?.name;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    throw new KaziUnavailableError(timedOut ? 'Kazi Connect did not answer in time' : 'Kazi Connect could not be reached');
  }
  if (res.status >= 500) throw new KaziUnavailableError(`Kazi Connect answered ${res.status}`);

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
// On globalThis because route bundles each get their own copy of this module.
interface Entry {
  expires: number;
  value: unknown;
}
const shared = globalThis as typeof globalThis & { __ujuziKaziCache?: Map<string, Entry> };
const cache = () => (shared.__ujuziKaziCache ??= new Map());

/** Returns a fresh cached value for the key, or loads, remembers and returns it. Failures are never cached. */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache().get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  cache().set(key, { expires: Date.now() + cacheMs(), value });
  return value;
}

export function clearKaziCache(): void {
  cache().clear();
}
