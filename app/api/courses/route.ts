import type { NextRequest } from 'next/server';
import { requirePartnerOrUser, requireStaff } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import { fail, guarded, json, readJson } from '@/lib/http';
import { toCourse, type Course } from '@/lib/mappers';
import { parseCourseDetails, parseCourseFilter } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 1 (S1): GET /api/courses?category=&county=. A partner key, or the website's login token.
export async function GET(req: NextRequest) {
  return guarded(async () => {
    const guard = await requirePartnerOrUser(req);
    if (!guard.ok) return guard.response;
    const filter = parseCourseFilter(req.nextUrl.searchParams);
    if (!filter.ok) return fail(400, filter.message);
    const rows = await (await getStore()).listCourses(filter.value);
    return json<Course[]>(200, rows.map(toCourse));
  });
}

// Endpoint 20 (G4): POST /api/courses. Staff create a course at their own centre.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const guard = await requireStaff(req);
    if (!guard.ok) return guard.response;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const details = parseCourseDetails(parsed.body);
    if (!details.ok) return fail(400, details.message);
    if (!guard.user.centre_id) return fail(403, 'This staff account is not attached to a centre');

    const course = await (await getStore()).createCourse({ ...details.value, centre_id: guard.user.centre_id });
    return json<Course>(201, toCourse(course), { Location: `/api/courses/${course.id}` });
  });
}
