import { WebSocket } from 'ws';
import { isKaziRateLimited, kaziKeyHeaders, noteKeyRefused, retryAfterMs } from '@/lib/clients/fetcher';
import { getApplicationStatus, KAZI_TERMINAL, parseStatusMessage, subscribeUrl, type KaziStatus } from '@/lib/clients/kaziClient';
import { getStore } from '@/lib/db';
import type { KaziApplicationRow } from '@/lib/db/types';
import { recordStatus } from './applicationStatus';
import type { Realtime } from './hooks';

const number = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const pollMs = () => number('KAZI_POLL_MS', 2 * 60_000);
const backoffBaseMs = () => number('KAZI_BACKOFF_BASE_MS', 1_000);
const backoffMaxMs = () => number('KAZI_BACKOFF_MAX_MS', 60_000);

/** 1 s, 2 s, 4 s ... up to a minute, with a little jitter so many sockets do not reconnect in step. */
export function backoffDelay(attempt: number, random = Math.random()): number {
  const raw = Math.min(backoffMaxMs(), backoffBaseMs() * 2 ** attempt);
  return Math.round(raw * (0.8 + 0.4 * random));
}

interface Watcher {
  applicationId: string;
  socket?: WebSocket;
  attempt: number;
  reconnect?: NodeJS.Timeout;
  poll: NodeJS.Timeout;
  connected: boolean;
  /** Kazi asked us to wait (429): no new connection or poll before this time (ms since the epoch). */
  pauseUntil?: number;
}

/**
 * Follows every pending Kazi application: one WebSocket each (endpoint 6), reconnecting with backoff when
 * it drops, plus a poll of endpoint 5 every 2 minutes in case the socket is silent. Each status it learns
 * is saved and pushed to the graduate's open pages; at accepted, filled or cancelled it stops.
 * Kazi being down never throws out of here: it just keeps trying.
 */
export class KaziSubscriber implements Realtime {
  private watchers = new Map<string, Watcher>();

  /** Starts following an application. Already following it, or already decided, does nothing. */
  watch(row: KaziApplicationRow): void {
    if (this.watchers.has(row.application_id) || KAZI_TERMINAL.includes(row.status)) return;
    const watcher: Watcher = {
      applicationId: row.application_id,
      attempt: 0,
      connected: false,
      poll: setInterval(() => void this.pollOnce(row.application_id), pollMs()),
    };
    this.watchers.set(row.application_id, watcher);
    this.connect(watcher);
  }

  unwatch(applicationId: string): void {
    const watcher = this.watchers.get(applicationId);
    if (!watcher) return;
    this.watchers.delete(applicationId);
    clearInterval(watcher.poll);
    if (watcher.reconnect) clearTimeout(watcher.reconnect);
    watcher.socket?.removeAllListeners();
    watcher.socket?.on('error', () => undefined);
    watcher.socket?.terminate();
  }

  /** On server start: follow every application that is still pending. */
  async resume(): Promise<number> {
    const pending = await (await getStore()).listPendingKaziApplications();
    for (const row of pending) this.watch(row);
    return pending.length;
  }

  stopAll(): void {
    for (const id of [...this.watchers.keys()]) this.unwatch(id);
  }

  /** For tests and diagnostics: how one application is being followed. */
  state(applicationId: string): 'connected' | 'reconnecting' | undefined {
    const watcher = this.watchers.get(applicationId);
    return watcher ? (watcher.connected ? 'connected' : 'reconnecting') : undefined;
  }

  get size(): number {
    return this.watchers.size;
  }

  // ---- internals ------------------------------------------------------------------------------------

  private connect(watcher: Watcher): void {
    if (this.watchers.get(watcher.applicationId) !== watcher) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(subscribeUrl(watcher.applicationId), { headers: kaziKeyHeaders() });
    } catch {
      this.scheduleReconnect(watcher);
      return;
    }
    watcher.socket = socket;

    socket.on('open', () => {
      watcher.connected = true;
      watcher.attempt = 0;
    });
    socket.on('message', (data) => {
      const message = parseStatusMessage(data.toString());
      if (message && message.applicationId === watcher.applicationId) void this.learn(watcher.applicationId, message.status);
    });
    // Kazi refuses the upgrade (404) for an application it does not know: ask by HTTP what became of it.
    // Kazi may also refuse our key (401) or ask us to wait (429): neither is retried in a tight loop.
    socket.on('unexpected-response', (_req, res) => {
      if (res.statusCode === 401) {
        noteKeyRefused();
        watcher.pauseUntil = Date.now() + backoffMaxMs();
      } else if (res.statusCode === 429) {
        watcher.pauseUntil = Date.now() + retryAfterMs(String(res.headers['retry-after'] ?? ''));
      } else {
        void this.pollOnce(watcher.applicationId);
        return;
      }
      res.resume();
      socket.terminate(); // 'close' follows, and the reconnect waits for pauseUntil
    });
    socket.on('error', () => undefined); // 'close' follows and handles it
    socket.on('close', () => {
      watcher.connected = false;
      this.scheduleReconnect(watcher);
    });
  }

  private scheduleReconnect(watcher: Watcher): void {
    if (this.watchers.get(watcher.applicationId) !== watcher || watcher.reconnect) return;
    const delay = Math.max(backoffDelay(watcher.attempt), (watcher.pauseUntil ?? 0) - Date.now());
    watcher.attempt += 1;
    watcher.reconnect = setTimeout(() => {
      watcher.reconnect = undefined;
      this.connect(watcher);
    }, delay);
  }

  /** The fallback: ask Kazi. A 404 means the application was withdrawn there. Kazi being down is ignored. */
  private async pollOnce(applicationId: string): Promise<void> {
    const watcher = this.watchers.get(applicationId);
    if (!watcher || (watcher.pauseUntil ?? 0) > Date.now()) return;
    try {
      const status = await getApplicationStatus(applicationId);
      await this.learn(applicationId, status === 'gone' ? 'cancelled' : status);
    } catch (err) {
      // Kazi cannot be reached right now, or asked us to wait; the next poll or reconnect tries again.
      if (isKaziRateLimited(err)) watcher.pauseUntil = Date.now() + err.retryAfterMs;
    }
  }

  private async learn(applicationId: string, status: KaziStatus): Promise<void> {
    try {
      await recordStatus(await getStore(), applicationId, status);
    } catch (err) {
      console.error(`Could not save status ${status} for ${applicationId}`, err);
      return;
    }
    if (KAZI_TERMINAL.includes(status)) this.unwatch(applicationId);
  }
}

const shared = globalThis as typeof globalThis & { __ujuziSubscriber?: KaziSubscriber };

/** The one subscriber of this process. */
export function getSubscriber(): KaziSubscriber {
  return (shared.__ujuziSubscriber ??= new KaziSubscriber());
}
