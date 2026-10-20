import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/db';
import { fail, guarded, json } from '@/lib/http';
import { toBooking, type Booking } from '@/lib/mappers';

export const dynamic = 'force-dynamic';

// Endpoint 5 (S4): GET /api/bookings/{bookingId}
// PUT, DELETE (Week 6) and PATCH (staff) are added to this file when the write phase starts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  return guarded(async () => {
    const { bookingId } = await params;
    const row = await (await getStore()).getBooking(bookingId);
    if (!row) return fail(404, `Booking ${bookingId} not found`);
    return json<Booking>(200, toBooking(row));
  });
}
