import type { NextRequest } from 'next/server';
import { requireGraduate } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import { guarded, json } from '@/lib/http';
import { toEnrolment, type Enrolment } from '@/lib/mappers';

export const dynamic = 'force-dynamic';

// Endpoint 13 (G2): GET /api/me/enrolments: the graduate's enrolments with their certificates.
export async function GET(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireGraduate(req);
    if (!guard.ok) return guard.response;
    const store = await getStore();
    const [enrolments, certificates, courses] = await Promise.all([
      store.listEnrolments(guard.user.id),
      store.listCertificates(guard.user.id),
      store.listCourses(),
    ]);
    const titles = new Map(courses.map((course) => [course.id, course.title]));
    const certificateOf = new Map(certificates.map((c) => [c.enrolment_id, c.certificate_no]));
    return json<Enrolment[]>(
      200,
      enrolments.map((row) => toEnrolment(row, titles.get(row.course_id) ?? row.course_id, certificateOf.get(row.id) ?? null)),
    );
  });
}
