import type { components } from '@/types/api';
import type { BookingRow, CertificateDetailRow, CourseDetailRow } from '@/lib/db/types';

// The return types come from the generated contract, so a change to openapi.yaml that these
// mappers do not follow fails `npm run typecheck`.
export type Course = components['schemas']['Course'];
export type CertificateCheck = components['schemas']['CertificateCheck'];
export type Booking = components['schemas']['Booking'];

/** ISO 8601 UTC with a Z and no milliseconds: 2026-11-23T07:00:00Z. */
export function isoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function toCourse(row: CourseDetailRow): Course {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    centre: { id: row.centre_id, name: row.centre_name },
    county: row.county,
    area: row.area,
    durationWeeks: row.duration_weeks,
    feeKes: row.fee_kes,
    nextStart: isoSeconds(row.next_start),
    certificateLevel: row.certificate_level,
  };
}

/** First name and the initial of the last name only: "Achieng O.". Never the full name. */
export function holderName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0).toUpperCase();
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim();
}

export function toCertificateCheck(row: CertificateDetailRow): CertificateCheck {
  return {
    certificateNo: row.certificate_no,
    valid: row.revoked_at === null,
    courseTitle: row.course_title,
    level: row.level,
    issuedOn: row.issued_on,
    holder: holderName(row.holder_first_name, row.holder_last_name),
  };
}

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    courseId: row.course_id,
    eventName: row.event_name,
    crewSize: row.crew_size,
    preferredStart: isoSeconds(row.preferred_start),
    status: row.status,
    createdAt: isoSeconds(row.created_at),
  };
}
