/**
 * Simple counts for the Kazi link, shown by GET /api/stats. In memory, so they restart from zero with the
 * server. Kept on globalThis because Next gives every route its own copy of each module (as with the job cache).
 */
export interface KaziMetrics {
  /** Calls made to Kazi (each counted once, however many attempts it took). */
  calls: number;
  /** Calls that ended in failure: down, too slow, a 5xx or something unreadable. */
  failures: number;
  /** Extra attempts made after a failed one. */
  retries: number;
  /** Calls Kazi answered with a 429. */
  rateLimited: number;
  /** Times saved job data was served because Kazi could not be reached. */
  staleServed: number;
  /** Failures by cause: "timeout", "ECONNREFUSED", "HTTP 503" and so on. A short, fixed-size list. */
  failuresByReason: Record<string, number>;
}

const empty = (): KaziMetrics => ({ calls: 0, failures: 0, retries: 0, rateLimited: 0, staleServed: 0, failuresByReason: {} });

const shared = globalThis as typeof globalThis & { __ujuziKaziMetrics?: KaziMetrics };
export const kaziMetrics = (): KaziMetrics => (shared.__ujuziKaziMetrics ??= empty());

const MAX_REASONS = 20;
export function noteKaziFailure(reason: string): void {
  const metrics = kaziMetrics();
  metrics.failures += 1;
  // Reasons come from a fixed set of causes, but the list is bounded anyway.
  const key = reason in metrics.failuresByReason || Object.keys(metrics.failuresByReason).length < MAX_REASONS ? reason : 'other';
  metrics.failuresByReason[key] = (metrics.failuresByReason[key] ?? 0) + 1;
}

export function resetKaziMetrics(): void {
  shared.__ujuziKaziMetrics = empty();
}
