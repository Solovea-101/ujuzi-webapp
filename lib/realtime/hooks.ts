import type { KaziApplicationRow } from '@/lib/db/types';

/**
 * How the routes reach the subscriber without importing it (it uses `ws`, which route bundles must not
 * bundle). server.ts installs the real subscriber on globalThis when it starts; with none installed
 * (a script, a bare test) these do nothing.
 */
export interface Realtime {
  watch(row: KaziApplicationRow): void;
  unwatch(applicationId: string): void;
}

const shared = globalThis as typeof globalThis & { __ujuziRealtime?: Realtime };

export const installRealtime = (realtime: Realtime | undefined): void => {
  shared.__ujuziRealtime = realtime;
};
export const watchApplication = (row: KaziApplicationRow): void => shared.__ujuziRealtime?.watch(row);
export const unwatchApplication = (applicationId: string): void => shared.__ujuziRealtime?.unwatch(applicationId);
