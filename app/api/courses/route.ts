import type { NextRequest } from 'next/server';
import { requirePartner } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import { fail, guarded, json } from '@/lib/http';
import { toCourse, type Course } from '@/lib/mappers';
import { parseCourseFilter } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 1 (S1): GET /api/courses?category=&county=
export async function GET(req: NextRequest) {
  return guarded(async () => {
    const guard = requirePartner(req);
    if (!guard.ok) return guard.response;
    const filter = parseCourseFilter(req.nextUrl.searchParams);
    if (!filter.ok) return fail(400, filter.message);
    const rows = await (await getStore()).listCourses(filter.value);
    return json<Course[]>(200, rows.map(toCourse));
  });
}
