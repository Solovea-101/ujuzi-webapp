/**
 * Calling a partner that can be slow, flaky or gone: one timeout for every attempt, a few careful retries,
 * and nothing else. It knows nothing about Kazi; fetcher.ts is the Kazi half.
 *
 * The rules (Week 11):
 *   - Retry a timeout, a failed connection, a 500, 502, 503 or 504, and a 429 once its Retry-After has passed.
 *   - Never retry a 4xx other than 429: the request is wrong and asking again changes nothing.
 *   - Never retry a write (POST, PUT, PATCH, DELETE): a retry might do it twice.
 *   - At most `retries` extra attempts, with a wait that doubles (200 ms, then 400 ms).
 *   - All attempts and waits together fit in `budgetMs`: a person is waiting.
 */

export type Sleep = (ms: number) => Promise<void>;

export interface ResilientConfig {
  /** The longest one attempt may take before it is given up. */
  timeoutMs: number;
  /** Extra attempts after the first, for reads only. */
  retries: number;
  /** The first wait between attempts; it doubles each time. */
  delayMs: number;
  /** All attempts and waits together. Unset: no overall limit. */
  budgetMs?: number;
  /** Replaced in tests so they do not really wait. */
  sleep?: Sleep;
  /** Told about every retry, so the caller can log it and count it. */
  onRetry?: (info: { attempt: number; attempts: number; waitMs: number; reason: string }) => void;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
/** Waiting for a 429 longer than this is not worth a person's time: the caller gets the 429 at once. */
export const MAX_RETRY_AFTER_MS = 5_000;
/** An attempt that would get less time than this is pointless, so the call stops instead. */
const MIN_ATTEMPT_MS = 250;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Why a call failed, in a few words for the log: "timeout", a network code such as ECONNREFUSED (nothing is
 * listening) or ENOTFOUND (the host name is wrong), or "network error". Never the URL and never any header.
 * Recognised by name because the abort error can come from another JavaScript realm (as under Jest).
 */
export function failureReason(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{3,40}$/.test(code) ? code : 'network error';
}

/**
 * fetch with a timeout on every attempt and, for a GET, careful retries. Returns the last response (the
 * caller decides what a 503 or 429 means) or throws the last network error once retries or time run out.
 */
export async function fetchWithRetry(url: string, init: RequestInit, config: ResilientConfig): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const maxRetries = method === 'GET' ? Math.max(0, Math.floor(config.retries)) : 0; // never retry a write
  const budget = config.budgetMs ?? Number.POSITIVE_INFINITY;
  const sleep = config.sleep ?? realSleep;
  const started = Date.now();
  const timeLeft = () => budget - (Date.now() - started);

  for (let attempt = 0; ; attempt++) {
    let wait = config.delayMs * 2 ** attempt;
    let response: Response | undefined;
    let error: unknown;
    let reason: string;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.max(1, Math.min(config.timeoutMs, timeLeft()))) });
      if (!RETRY_STATUSES.has(response.status)) return response;
      reason = `HTTP ${response.status}`;
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'));
        if (Number.isFinite(seconds) && seconds > 0) {
          wait = Math.ceil(seconds) * 1000;
          if (wait > MAX_RETRY_AFTER_MS) return response; // asked to wait too long: hand the 429 back now
        }
      }
    } catch (err) {
      error = err;
      reason = failureReason(err);
    }

    if (attempt >= maxRetries || timeLeft() < wait + MIN_ATTEMPT_MS) {
      if (response) return response;
      throw error;
    }
    if (response) void response.body?.cancel().catch(() => undefined); // free the connection; not awaited, so it can never hold up the retry
    config.onRetry?.({ attempt: attempt + 1, attempts: maxRetries + 1, waitMs: wait, reason });
    await sleep(wait);
  }
}
