import type { KaziStatus } from '@/lib/clients/kaziClient';
import { KAZI_TERMINAL } from '@/lib/clients/kaziClient';
import type { Store } from '@/lib/db/types';
import { isoSeconds } from '@/lib/mappers';
import { pushToGraduate } from './graduateFeed';

/**
 * Saves a status Kazi reported and tells the graduate's open pages. A status only ever moves forward:
 * once an application is accepted, filled or cancelled, nothing changes it. Returns whether it changed.
 * Used by the subscriber (WebSocket and poller) and by the routes (after a withdrawal).
 */
export async function recordStatus(store: Store, applicationId: string, status: KaziStatus): Promise<boolean> {
  const row = await store.getKaziApplication(applicationId);
  if (!row || row.status === status || KAZI_TERMINAL.includes(row.status)) return false;
  // "Only if it is still what I read": when the route and the subscriber report the same status at the
  // same moment, exactly one of them gets the row back and announces it.
  const updated = await store.updateKaziApplication(applicationId, { status }, row.status);
  if (!updated) return false;
  pushToGraduate(row.graduate_id, { applicationId, status, updatedAt: isoSeconds(updated.updated_at) });
  return true;
}
