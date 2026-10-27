import { hashKey, hasValidPartnerKey } from '@/lib/auth/partnerKey';

/**
 * Rate limiting: how much any one caller may do. A fixed window per caller kept in this server's memory,
 * so it resets on a restart and is per server copy (a shared store such as Redis is what a bigger
 * deployment would use). Three kinds of caller, each counted separately:
 *   - a partner with a VALID key: counted per key (default 100 requests a minute);
 *   - everyone else (website users, anonymous callers, wrong or made-up keys): counted per network address
 *     (default 120 a minute), so rotating fake keys or tokens never gives a fresh allowance;
 *   - sign-in attempts (login and register): also counted per address (default 10 a minute), to slow
 *     down password guessing.
 */

export interface Decision {
  allowed: boolean;
  /** Seconds until the caller's window resets: what Retry-After says. */
  retryAfter: number;
  remaining: number;
}

interface Window {
  count: number;
  resetAt: number;
}

const MAX_TRACKED = 10_000;

export class RateLimiter {
  private windows = new Map<string, Window>();

  /** Counts one request for this caller and says whether it is within `max` per `windowMs`. */
  check(id: string, max: number, windowMs: number, now = Date.now()): Decision {
    let window = this.windows.get(id);
    if (!window || now >= window.resetAt) {
      if (this.windows.size >= MAX_TRACKED) this.sweep(now);
      window = { count: 0, resetAt: now + windowMs };
      this.windows.set(id, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= max,
      retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
      remaining: Math.max(0, max - window.count),
    };
  }

  /** Forgets every window that has already ended, and if that is not enough, the oldest ones: memory stays bounded. */
  private sweep(now: number): void {
    for (const [id, window] of this.windows) if (now >= window.resetAt) this.windows.delete(id);
    if (this.windows.size >= MAX_TRACKED) {
      const oldest = [...this.windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, MAX_TRACKED / 2);
      for (const [id] of oldest) this.windows.delete(id);
    }
  }

  clear(): void {
    this.windows.clear();
  }

  get size(): number {
    return this.windows.size;
  }
}

// On globalThis: the proxy and the tests are separate bundles that must share one set of counters.
const shared = globalThis as typeof globalThis & { __ujuziLimiter?: RateLimiter };
export const sharedLimiter = (): RateLimiter => (shared.__ujuziLimiter ??= new RateLimiter());

const number = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** The limits, read on every request so they can be changed (and tested) without a restart. */
export const limits = () => ({
  partner: number('RATE_LIMIT_PARTNER', 100),
  anonymous: number('RATE_LIMIT_ANON', 120),
  signIn: number('RATE_LIMIT_LOGIN', 10),
  windowMs: number('RATE_LIMIT_WINDOW_MS', 60_000),
});

const SIGN_IN_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

/**
 * The caller's network address. server.ts writes the real peer address into x-ujuzi-peer (overwriting
 * anything the client sent). Behind a proxy that address is the proxy's, so with TRUST_PROXY=true the
 * LAST entry of X-Forwarded-For is used: the one the nearest proxy added, which a client cannot forge.
 */
export function clientAddress(headers: Headers): string {
  if (process.env.TRUST_PROXY === 'true') {
    const entries = (headers.get('x-forwarded-for') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1];
  }
  return headers.get('x-ujuzi-peer') ?? 'unknown';
}

/** Counts this request against every allowance that applies, and returns the strictest verdict. */
export function rateLimitRequest(method: string, pathname: string, headers: Headers, now = Date.now()): Decision {
  const { partner, anonymous, signIn, windowMs } = limits();
  const limiter = sharedLimiter();
  const address = clientAddress(headers);

  const presented = headers.get('x-api-key');
  const decisions: Decision[] = [];
  if (presented && hasValidPartnerKey(presented)) {
    // Only a valid key gets its own allowance; the id is a hash, so the key itself is never kept.
    decisions.push(limiter.check(`key:${hashKey(presented).slice(0, 16)}`, partner, windowMs, now));
  } else {
    decisions.push(limiter.check(`ip:${address}`, anonymous, windowMs, now));
  }
  if (method === 'POST' && SIGN_IN_PATHS.has(pathname)) {
    decisions.push(limiter.check(`signin:${address}`, signIn, windowMs, now));
  }
  const denied = decisions.filter((d) => !d.allowed);
  if (denied.length > 0) return { allowed: false, retryAfter: Math.max(...denied.map((d) => d.retryAfter)), remaining: 0 };
  return { allowed: true, retryAfter: 0, remaining: Math.min(...decisions.map((d) => d.remaining)) };
}
