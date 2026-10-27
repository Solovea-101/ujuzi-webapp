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
 * client is read from X-Forwarded-For, counting TRUST_PROXY_HOPS entries from the RIGHT (default 1: the entry
 * the nearest proxy added). Everything to the left of those can be written by the client, so it is never used.
 * Set TRUST_PROXY_HOPS to the number of proxies in front of the server (Render's chain is not documented well
 * enough to guess: deploy with LOG_CLIENT_ADDRESS=true, call from two networks, and read what it logs).
 * With fewer entries than hops, or no header, the peer address is used.
 */
export function clientAddress(headers: Headers): string {
  if (process.env.TRUST_PROXY === 'true') {
    const hops = Math.floor(number('TRUST_PROXY_HOPS', 1));
    const entries = (headers.get('x-forwarded-for') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
    if (entries.length >= hops) return entries[entries.length - hops];
  }
  return headers.get('x-ujuzi-peer') ?? 'unknown';
}

// With LOG_CLIENT_ADDRESS=true the first few requests print how the address was worked out, so the right
// TRUST_PROXY_HOPS can be found on a real deployment. Off by default: addresses are personal data.
const diagnostics = globalThis as typeof globalThis & { __ujuziAddressLogs?: number };
function logAddress(headers: Headers, chosen: string): void {
  if (process.env.LOG_CLIENT_ADDRESS !== 'true') return;
  const done = (diagnostics.__ujuziAddressLogs ??= 0);
  if (done >= 30) return;
  diagnostics.__ujuziAddressLogs = done + 1;
  console.log(`client-address: chosen=${chosen} peer=${headers.get('x-ujuzi-peer')} x-forwarded-for=[${headers.get('x-forwarded-for') ?? ''}] hops=${number('TRUST_PROXY_HOPS', 1)}`);
}

/** Counts this request against every allowance that applies, and returns the strictest verdict. */
export function rateLimitRequest(method: string, pathname: string, headers: Headers, now = Date.now()): Decision {
  const { partner, anonymous, signIn, windowMs } = limits();
  const limiter = sharedLimiter();
  const address = clientAddress(headers);
  logAddress(headers, address);

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
