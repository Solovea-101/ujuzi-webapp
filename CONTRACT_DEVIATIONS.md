# Ujuzi API: Contract Deviations

Every change made to `openapi.yaml` after it is handed off to Sherehe in Week 4: what changed, and why the original did not hold up. Endpoint numbers match ENDPOINT_LIST.md. Every change that affects a client is flagged to Sherehe before it is deployed, and `info.version` goes up.

## Week 5: GET endpoints

Endpoints 1, 2, 3 and 5 (`GET /api/courses`, `GET /api/courses/{courseId}`, `GET /api/certificates/{certificateNo}`, `GET /api/bookings/{bookingId}`) were checked against `openapi.yaml` version 0.1.0 by `npm run verify`: 17 requests, good and bad input, every answer compared field by field (status, exact field names, types, enums, date-time format, no extra and no missing fields). All 17 matched. The evidence is in VERIFICATION.md.

Not built yet, and not a change to the contract: the `401` that `openapi.yaml` documents on every partner endpoint (missing `X-API-Key`). Key checking is the Week 9 task (R4), so until then these GETs answer without a key.

TODO (the team): confirm that `openapi.yaml` 0.1.0 is the version handed off to Sherehe. If it is, finish this section with "No deviations: every GET matched the contract as handed off." If the handed-off version differs, list each difference below in the entry format at the end of this file.

## Week 6: write endpoints

Endpoints 4, 6 and 7 (`POST /api/bookings`, `PUT /api/bookings/{bookingId}`, `DELETE /api/bookings/{bookingId}`) were checked against `openapi.yaml` version 0.1.0 by `npm run verify`: 28 requests, good and bad input. Every answer matched the contract field by field, every successful write was re-fetched with a GET to confirm it, and every rejected write was shown to have changed nothing. The evidence is in VERIFICATION.md. Endpoint 24 (`PATCH`, staff) is not built: it needs the staff login.

**Found while building**

- **`413` was not documented.** A body over 20 KB answers `413 { "message": "Request body must be 20 KB or less" }` on `POST`, `PUT` and `PATCH`, and the README's error table lists 413, but `openapi.yaml` 0.1.0 documented no 413. Fixed in 0.1.1 (see "After handoff" below), and `npm run verify` now checks it.
- **The `401` is still not enforced**, as under Week 5: partner key checking is Week 9.

**Rules the contract left open, now written into the contract's descriptions in 0.1.1**

- *Duplicate booking (the 409 on `POST`):* a second **pending** booking with the same `courseId` and the same `eventName`, ignoring case and surrounding spaces. Once the first booking is confirmed, declined or cancelled, the event can be booked again. Enforced in the database, so two simultaneous requests cannot both succeed.
- *Order of checks:* a body that fails validation answers 400 before anything else is looked up (a bad body for an unknown course or booking is 400, not 404); then 404, then 409.
- *`preferredStart` input:* any RFC 3339 date-time with a `Z` or an offset is accepted and answered as UTC with a `Z` and no milliseconds; a date with no time, a time with no zone, or a day that does not exist (30 February) is 400.
- *`eventName`* is trimmed and must be 1 to 120 characters. *`PUT`* cannot change the event or the course: those fields are unknown to it, so sending them is 400.
- *Ids* are unique and increasing but not gap-free on PostgreSQL: a refused write can skip a number. (An implementation note, not a contract rule.)

## After handoff: version 0.1.1

**Endpoints 4, 6 and 24, `POST /api/bookings`, `PUT /api/bookings/{bookingId}`, `PATCH /api/bookings/{bookingId}` (S3, S5, G5)**
What changed: a `413` response (body over 20 KB, `{ "message": "Request body must be 20 KB or less" }`) is documented on all three, using a new shared `PayloadTooLarge` response. The descriptions of `POST` and `PUT` now state the order of checks, the duplicate-booking rule and that `PUT` cannot change the event or the course. `preferredStart` documents the accepted date-time forms and `eventName` documents trimming; `eventName` gains `minLength: 1`, which the API already enforced. `info.version` goes from 0.1.0 to 0.1.1. No field, status code or behaviour changed.
Why the original did not hold up: the API already returned 413, and already applied these rules, but a partner reading the contract could not have known: the 413 would have been an undocumented response and the 409 an unexplained one.
Flagged to Sherehe: TODO. The team tells Sherehe's sub-team before this is deployed (R8). Nothing is deployed yet.

TODO (the team): confirm whether `openapi.yaml` 0.1.0 had been handed off to Sherehe. If it had, the entry above is the record of the change; if not, this section can be folded into the original contract.

## Entry format

For each change:

**Endpoint N, `METHOD /path` (need)**
What changed: ...
Why the original did not hold up: ...
Flagged to Sherehe: date and how.
