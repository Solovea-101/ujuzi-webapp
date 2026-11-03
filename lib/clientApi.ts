import type { components } from '@/types/api';

// The browser's side of talking to our own /api. Pages call this, never the database or Kazi directly.
export type Schemas = components['schemas'];

const TOKEN_KEY = 'ujuzi.token';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage blocked: the page simply behaves as logged out
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignored
  }
}

/** A failure carries the message the API sent. `retryAfter` (seconds) is set when the API sent a Retry-After header, as on a 429. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; retryAfter?: number };

/** One call to our API with the login token attached. Never throws: a failure is { ok: false, message }. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const token = getToken();
  try {
    const res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const text = await res.text();
    let body: unknown;
    try {
      body = text === '' ? undefined : JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (res.ok) return { ok: true, data: body as T };
    const message = typeof body === 'object' && body !== null && 'message' in body ? String((body as { message: unknown }).message) : `Something went wrong (${res.status})`;
    const wait = Number(res.headers.get('retry-after'));
    return { ok: false, status: res.status, message, ...(Number.isFinite(wait) && wait > 0 ? { retryAfter: Math.ceil(wait) } : {}) };
  } catch {
    return { ok: false, status: 0, message: 'Could not reach the server. Check your connection and try again.' };
  }
}

/** The date-time an <input type="datetime-local"> holds, as UTC with a Z and no milliseconds. */
export function localInputToUtc(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** "2026-11-23T07:00:00Z" as a short local date and time for people to read. */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const kes = (amount: number) => `KES ${amount.toLocaleString('en-KE')}`;
