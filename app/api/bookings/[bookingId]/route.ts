import type { NextRequest } from 'next/server';
import { requirePartner, requireStaff } from '@/lib/auth/guards';
import { getStore } from '@/lib/db';
import type { BookingOutcome } from '@/lib/db/types';
import { fail, guarded, json, noContent, readJson } from '@/lib/http';
import { toBooking, type Booking } from '@/lib/mappers';
import { parseBookingChange, parseBookingDecision } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ bookingId: string }> };

/** The answer for an outcome that is not "ok": 404 for no such booking, 409 once it is no longer pending. */
function refused(outcome: Exclude<BookingOutcome, { kind: 'ok' }>, bookingId: string, verb: string) {
  if (outcome.kind === 'not_found') return fail(404, `Booking ${bookingId} not found`);
  return fail(409, `Booking ${bookingId} is ${outcome.booking.status}; only pending bookings can be ${verb}`);
}

// Endpoint 5 (S4): GET /api/bookings/{bookingId}
export async function GET(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = requirePartner(req);
    if (!guard.ok) return guard.response;
    const { bookingId } = await params;
    const row = await (await getStore()).getBooking(bookingId);
    if (!row) return fail(404, `Booking ${bookingId} not found`);
    return json<Booking>(200, toBooking(row));
  });
}

// Endpoint 6 (S5): PUT /api/bookings/{bookingId}. Sets crewSize and preferredStart to exactly what
// is sent, so sending the same body twice leaves the same booking.
export async function PUT(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = requirePartner(req);
    if (!guard.ok) return guard.response;
    const { bookingId } = await params;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const change = parseBookingChange(parsed.body);
    if (!change.ok) return fail(400, change.message);

    const outcome = await (await getStore()).updateBooking(bookingId, change.value);
    if (outcome.kind !== 'ok') return refused(outcome, bookingId, 'changed');
    return json<Booking>(200, toBooking(outcome.booking));
  });
}

// Endpoint 7 (S5): DELETE /api/bookings/{bookingId}. A cancelled booking no longer exists.
export async function DELETE(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = requirePartner(req);
    if (!guard.ok) return guard.response;
    const { bookingId } = await params;
    const outcome = await (await getStore()).deleteBooking(bookingId);
    if (outcome.kind !== 'ok') return refused(outcome, bookingId, 'cancelled');
    return noContent();
  });
}

// Endpoint 24 (G5): PATCH /api/bookings/{bookingId}. Staff at the booking's centre confirm or decline a
// pending booking. Order: login (401), body (400, 413), booking (404), centre (403), state (409).
export async function PATCH(req: NextRequest, { params }: Context) {
  return guarded(async () => {
    const guard = await requireStaff(req);
    if (!guard.ok) return guard.response;
    const { bookingId } = await params;
    const parsed = await readJson(req);
    if (!parsed.ok) return parsed.response;
    const decision = parseBookingDecision(parsed.body);
    if (!decision.ok) return fail(400, decision.message);

    const store = await getStore();
    const booking = await store.getBooking(bookingId);
    if (!booking) return fail(404, `Booking ${bookingId} not found`);
    const course = await store.getCourse(booking.course_id);
    if (course?.centre_id !== guard.user.centre_id) return fail(403, 'Only staff at this centre can decide its bookings.');

    const outcome = await store.decideBooking(bookingId, decision.value);
    if (outcome.kind !== 'ok') return refused(outcome, bookingId, 'decided');
    return json<Booking>(200, toBooking(outcome.booking));
  });
}
