import type { NextRequest } from 'next/server';
import { requireGraduate } from '@/lib/auth/guards';
import { createApplication, deleteApplication } from '@/lib/clients/kaziClient';
import { respondToKazi } from '@/lib/clients/respond';
import { getStore } from '@/lib/db';
import { fail, guarded, json, readJson } from '@/lib/http';
import { isoSeconds, toApplication, type Application } from '@/lib/mappers';
import { watchApplication } from '@/lib/realtime/hooks';
import { parseNewApplication } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 16 (G3): GET /api/me/applications. Every application this graduate made, withdrawn ones included.
export async function GET(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireGraduate(req);
    if (!guard.ok) return guard.response;
    const rows = await (await getStore()).listKaziApplications(guard.user.id);
    return json<Application[]>(200, rows.map(toApplication));
  });
}

// Endpoint 15 (G3): POST /api/me/applications. Ujuzi applies at Kazi Connect for the graduate, saves the
// application id Kazi gives back (Kazi cannot list one student's applications, so this is the only record),
// and starts following its status.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireGraduate(req);
    if (!guard.ok) return guard.response;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const input = parseNewApplication(parsed.body);
    if (!input.ok) return fail(400, input.message);
    const { jobId, preferredDate, note } = input.value;

    let created;
    try {
      // studentId is our graduate id (grd_0101): never a name, email or phone.
      created = await createApplication({
        jobId,
        studentId: guard.user.id,
        preferredDate: isoSeconds(preferredDate),
        ...(note !== '' ? { note } : {}),
      });
    } catch (err) {
      const answer = respondToKazi(err, {
        400: 'Kazi Connect did not accept this application: check that the job exists and the date is in the future',
        409: `Job ${jobId} is closed and is not accepting applications`,
      });
      if (answer) return answer;
      throw err;
    }

    const store = await getStore();
    try {
      const row = await store.createKaziApplication({
        application_id: created.applicationId,
        graduate_id: guard.user.id,
        job_id: created.jobId,
        preferred_date: preferredDate,
        note,
        status: 'pending',
      });
      watchApplication(row);
      return json<Application>(201, toApplication(row), { Location: `/api/me/applications/${row.application_id}` });
    } catch (err) {
      // Kazi has the application but we could not save it: withdraw it, so nothing exists that we cannot see.
      console.error(`Could not save Kazi application ${created.applicationId}; withdrawing it`, err);
      await deleteApplication(created.applicationId).catch((undoErr) =>
        console.error(`Could not withdraw Kazi application ${created.applicationId} either`, undoErr),
      );
      throw err;
    }
  });
}
