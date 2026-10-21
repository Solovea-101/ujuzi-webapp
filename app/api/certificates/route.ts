import type { NextRequest } from 'next/server';
import { requireStaff } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import { isStoreConflict } from '@/lib/db/types';
import { fail, guarded, json, readJson } from '@/lib/http';
import { toCertificateCheck, type CertificateCheck } from '@/lib/mappers';
import { parseNewCertificate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 22 (G4): POST /api/certificates. Staff issue the certificate for an enrolment in one of their
// own centre's courses. The course title and level are copied onto it now, so later edits to the
// course never change what an old certificate says.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireStaff(req);
    if (!guard.ok) return guard.response;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const input = parseNewCertificate(parsed.body);
    if (!input.ok) return fail(400, input.message);

    const store = await getStore();
    const enrolment = await store.getEnrolment(input.value.enrolmentId);
    if (!enrolment) return fail(404, `Enrolment ${input.value.enrolmentId} not found`);
    const course = await store.getCourse(enrolment.course_id);
    if (!course) return fail(404, `Course ${enrolment.course_id} not found`);
    if (course.centre_id !== guard.user.centre_id) return fail(403, 'Only staff at this centre can issue its certificates');

    try {
      const issued = await store.createCertificate({
        enrolment_id: enrolment.id,
        course_title: course.title,
        level: course.certificate_level,
        issued_on: new Date().toISOString().slice(0, 10),
      });
      const detail = await store.getCertificate(issued.certificate_no);
      if (!detail) throw new Error(`Certificate ${issued.certificate_no} vanished after it was issued`);
      return json<CertificateCheck>(201, toCertificateCheck(detail), { Location: `/api/certificates/${issued.certificate_no}` });
    } catch (err) {
      if (isStoreConflict(err)) return fail(409, `A certificate was already issued for enrolment ${enrolment.id}`);
      throw err;
    }
  });
}
