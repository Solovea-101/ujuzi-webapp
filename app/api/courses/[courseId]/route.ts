import type { NextRequest } from 'next/server';
import { requirePartnerOrUser, requireStaff } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import { fail, guarded, json, readJson } from '@/lib/http';
import { toCourse, type Course } from '@/lib/mappers';
import { parseCourseDetails } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ courseId: string }> };

// Endpoint 2 (S1): GET /api/courses/{courseId}. A partner key, or the website's login token.
export async function GET(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = await requirePartnerOrUser(req);
    if (!guard.ok) return guard.response;
    const { courseId } = await params;
    const row = await (await getStore()).getCourse(courseId);
    if (!row) return fail(404, `Course ${courseId} not found`);
    return json<Course>(200, toCourse(row));
  });
}

// Endpoint 21 (G4): PUT /api/courses/{courseId}. Sets every detail; only staff at the course's own centre.
// Order: login (401), body (400, 413), course (404), centre (403).
export async function PUT(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = await requireStaff(req);
    if (!guard.ok) return guard.response;
    const { courseId } = await params;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const details = parseCourseDetails(parsed.body);
    if (!details.ok) return fail(400, details.message);

    const store = await getStore();
    const course = await store.getCourse(courseId);
    if (!course) return fail(404, `Course ${courseId} not found`);
    if (course.centre_id !== guard.user.centre_id) return fail(403, 'Only staff at this centre can change its courses');

    const updated = await store.updateCourse(courseId, { ...details.value, centre_id: course.centre_id });
    return updated ? json<Course>(200, toCourse(updated)) : fail(404, `Course ${courseId} not found`);
  });
}
