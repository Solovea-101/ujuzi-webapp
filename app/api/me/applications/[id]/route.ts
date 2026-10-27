import type { NextRequest } from 'next/server';
import { requireGraduate } from '@/lib/auth/guards';
import { deleteApplication, getApplicationStatus, updateApplication } from '@/lib/clients/kaziClient';
import { respondToKazi } from '@/lib/clients/respond';
import { getStore } from '@/lib/db';
import type { KaziApplicationRow, Store } from '@/lib/db/types';
import { fail, guarded, json, noContent, readJson } from '@/lib/http';
import { isoSeconds, toApplication, type Application } from '@/lib/mappers';
import { recordStatus } from '@/lib/realtime/applicationStatus';
import { unwatchApplication } from '@/lib/realtime/hooks';
import { parseApplicationUpdate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

/** The application, if it is this graduate's own. Someone else's is "not found", not "forbidden". */
async function ownApplication(store: Store, id: string, graduateId: string): Promise<KaziApplicationRow | undefined> {
  const row = await store.getKaziApplication(id);
  return row && row.graduate_id === graduateId ? row : undefined;
}

/** Kazi refused because the application is no longer pending: learn its real status for the next reader. */
async function refreshStatus(store: Store, id: string): Promise<void> {
  try {
    const status = await getApplicationStatus(id);
    await recordStatus(store, id, status === 'gone' ? 'cancelled' : status);
  } catch {
    // Kazi is not answering; the subscriber and the poller will catch up.
  }
}

// Endpoint 17 (G3): PUT /api/me/applications/{id}. Reschedules a pending application; sets an absolute state.
export async function PUT(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = await requireGraduate(req);
    if (!guard.ok) return guard.response;
    const { id } = await params;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const change = parseApplicationUpdate(parsed.body);
    if (!change.ok) return fail(400, change.message);

    const store = await getStore();
    const row = await ownApplication(store, id, guard.user.id);
    if (!row) return fail(404, `Application ${id} not found`);
    if (row.status !== 'pending') return fail(409, `Application ${id} is ${row.status}; only pending applications can be changed`);

    try {
      await updateApplication(id, {
        preferredDate: isoSeconds(change.value.preferredDate),
        ...(change.value.note !== '' ? { note: change.value.note } : {}),
      });
    } catch (err) {
      const answer = respondToKazi(err, {
        400: 'Kazi Connect did not accept these details: check that the date is in the future',
        404: `Application ${id} no longer exists at Kazi Connect`,
        409: `Application ${id} has already been decided at Kazi Connect and can no longer be changed`,
      });
      if (!answer) throw err;
      if (answer.status === 404 || answer.status === 409) await refreshStatus(store, id);
      return answer;
    }
    const updated = await store.updateKaziApplication(id, { preferred_date: change.value.preferredDate, note: change.value.note });
    return updated ? json<Application>(200, toApplication(updated)) : fail(404, `Application ${id} not found`);
  });
}

// Endpoint 18 (G3): DELETE /api/me/applications/{id}. Withdraws a pending application. It stays in the
// graduate's list as cancelled. If Kazi no longer has it, it is cancelled all the same.
export async function DELETE(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = await requireGraduate(req);
    if (!guard.ok) return guard.response;
    const { id } = await params;

    const store = await getStore();
    const row = await ownApplication(store, id, guard.user.id);
    if (!row) return fail(404, `Application ${id} not found`);
    if (row.status !== 'pending') return fail(409, `Application ${id} is ${row.status}; only pending applications can be withdrawn`);

    try {
      await deleteApplication(id);
    } catch (err) {
      const gone = err instanceof Error && err.name === 'KaziRejectedError' && (err as { status?: number }).status === 404;
      if (!gone) {
        const answer = respondToKazi(err, {
          409: `Application ${id} has already been decided at Kazi Connect and can no longer be withdrawn`,
        });
        if (!answer) throw err;
        if (answer.status === 409) await refreshStatus(store, id);
        return answer;
      }
    }
    await recordStatus(store, id, 'cancelled');
    unwatchApplication(id);
    return noContent();
  });
}
