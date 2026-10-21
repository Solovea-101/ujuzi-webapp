import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/db';
import { isStoreConflict } from '@/lib/db/types';
import { fail, guarded, json, readJson } from '@/lib/http';
import { toBooking, type Booking } from '@/lib/mappers';
import { parseNewBooking } from '@/lib/validation';

export const dynamic = 'force-dynamic';

// Endpoint 4 (S3): POST /api/bookings. Validation first, then the course, then the duplicate rule.
// GET /api/bookings (staff list, Endpoint 23) is added to this file with the staff login.
export async function POST(req: NextRequest) {
  return guarded(async () => {
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const input = parseNewBooking(parsed.body);
    if (!input.ok) return fail(400, input.message);

    const store = await getStore();
    if (!(await store.getCourse(input.value.course_id))) {
      return fail(404, `Course ${input.value.course_id} not found`);
    }
    try {
      const booking = await store.createBooking(input.value);
      return json<Booking>(201, toBooking(booking), { Location: `/api/bookings/${booking.id}` });
    } catch (err) {
      if (isStoreConflict(err)) {
        return fail(409, `A pending booking named "${input.value.event_name}" already exists for course ${input.value.course_id}`);
      }
      throw err;
    }
  });
}
