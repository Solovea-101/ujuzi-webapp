import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth/guards';
import { readActiveJobs } from '@/lib/clients/kaziClient';
import { respondToKazi } from '@/lib/clients/respond';
import { getStore } from '@/lib/db';
import { CATEGORIES, type Category } from '@/lib/db/types';
import { fail, guarded, json } from '@/lib/http';
import { toJobMatch, type JobMatch } from '@/lib/mappers';
import { findCounty } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 14 (G3): GET /api/courses/{courseId}/job-matches?county=. The active Kazi jobs in the course's
// category, in the county asked for (default: the course's own). Kazi being down is our own 502, and
// nothing else in the API is affected. When Kazi cannot be reached but a good list was read earlier, that list
// is returned (still a bare array) with X-Data-Stale: true and X-Data-As-Of: when it was read, so a page can
// say the jobs are saved copies.
export async function GET(req: NextRequest, { params }: { params: Promise<{ courseId: string }> }) {
  return guarded(async () => {
    const guard = await requireUser(req);
    if (!guard.ok) return guard.response;
    const { courseId } = await params;

    const asked = req.nextUrl.searchParams.getAll('county');
    if (asked.length > 1) return fail(400, 'county may only be given once');
    let county = asked[0] === undefined ? undefined : findCounty(asked[0]);
    if (asked[0] !== undefined && !county) return fail(400, "county must be one of Kenya's 47 counties, for example Nairobi");

    const course = await (await getStore()).getCourse(courseId);
    if (!course) return fail(404, `Course ${courseId} not found`);
    county ??= course.county;

    try {
      const { value: jobs, stale, asOf } = await readActiveJobs({ county, category: course.category });
      const matches: JobMatch[] = [];
      for (const job of jobs) {
        // Kazi filters ignoring case; check again, and skip a category outside the shared list.
        const category = CATEGORIES.find((c) => c === job.category.toLowerCase()) as Category | undefined;
        if (job.status === 'active' && category === course.category && job.county.toLowerCase() === county.toLowerCase()) {
          matches.push(toJobMatch(job, category));
        }
      }
      return json<JobMatch[]>(200, matches, stale ? { 'X-Data-Stale': 'true', 'X-Data-As-Of': asOf } : undefined);
    } catch (err) {
      const answer = respondToKazi(err, {});
      if (answer) return answer;
      throw err;
    }
  });
}
