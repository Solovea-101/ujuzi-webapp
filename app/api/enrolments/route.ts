import type { NextRequest } from 'next/server';
import { requireGraduate } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import { isStoreConflict } from '@/lib/db/types';
import { fail, guarded, json, readJson } from '@/lib/http';
import { toEnrolment, type Enrolment } from '@/lib/mappers';
import { parseNewEnrolment } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 12 (G2): POST /api/enrolments. Enrols the logged in graduate; once per course.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireGraduate(req);
    if (!guard.ok) return guard.response;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const input = parseNewEnrolment(parsed.body);
    if (!input.ok) return fail(400, input.message);

    const store = await getStore();
    const course = await store.getCourse(input.value.courseId);
    if (!course) return fail(404, `Course ${input.value.courseId} not found`);
    try {
      const row = await store.createEnrolment({ graduate_id: guard.user.id, course_id: course.id });
      return json<Enrolment>(201, toEnrolment(row, course.title, null));
    } catch (err) {
      if (isStoreConflict(err)) return fail(409, `You are already enrolled in course ${course.id}`);
      throw err;
    }
  });
}
