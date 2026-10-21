import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/db';
import { fail, guarded, json } from '@/lib/http';
import { toCourse, type Course } from '@/lib/mappers';

export const dynamic = 'force-dynamic';

// Endpoint 2 (S1): GET /api/courses/{courseId}
export async function GET(_req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  return guarded(async () => {
    const { courseId } = await params;
    const row = await (await getStore()).getCourse(courseId);
    if (!row) return fail(404, `Course ${courseId} not found`);
    return json<Course>(200, toCourse(row));
  });
}
