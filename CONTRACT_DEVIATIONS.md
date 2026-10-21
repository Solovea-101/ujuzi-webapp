# Ujuzi API: Contract Deviations

Every change made to `openapi.yaml` after it is handed off to Sherehe in Week 4: what changed, and why the original did not hold up. Endpoint numbers match ENDPOINT_LIST.md. Every change that affects a client is flagged to Sherehe before it is deployed, and `info.version` goes up.

## Week 5: GET endpoints

Endpoints 1, 2, 3 and 5 (`GET /api/courses`, `GET /api/courses/{courseId}`, `GET /api/certificates/{certificateNo}`, `GET /api/bookings/{bookingId}`) were checked against `openapi.yaml` version 0.1.0 by `npm run verify`: 17 requests, good and bad input, every answer compared field by field (status, exact field names, types, enums, date-time format, no extra and no missing fields). All 17 matched. The evidence is in VERIFICATION.md.

Not built yet, and not a change to the contract: the `401` that `openapi.yaml` documents on every partner endpoint (missing `X-API-Key`). Key checking is the Week 9 task (R4), so until then these GETs answer without a key.

TODO (the team): confirm that `openapi.yaml` 0.1.0 is the version handed off to Sherehe. If it is, finish this section with "No deviations: every GET matched the contract as handed off." If the handed-off version differs, list each difference below in the entry format at the end of this file.

## Week 6: write endpoints

Endpoints 4, 6 and 7 (`POST /api/bookings`, `PUT /api/bookings/{bookingId}`, `DELETE /api/bookings/{bookingId}`) were checked against `openapi.yaml` version 0.1.0 by `npm run verify`: 28 requests, good and bad input. Every answer matched the contract field by field, every successful write was re-fetched with a GET to confirm it, and every rejected write was shown to have changed nothing. The evidence is in VERIFICATION.md. Endpoint 24 (`PATCH`, staff) is not built: it needs the staff login.

**Found while building, not yet a change to the contract**

- **`413` is not documented.** A body over 20 KB answers `413 { "message": "Request body must be 20 KB or less" }` on `POST` and `PUT`, and the README's error table lists 413, but `openapi.yaml` documents no 413 on either operation. Suggested fix: add a `413` response (using the existing `Error` schema) to Endpoints 4 and 6. This is a contract change, so if 0.1.0 has been handed off it needs a version bump and a word with Sherehe before it is deployed (R8).
- **The `401` is still not enforced**, as under Week 5: partner key checking is Week 9.

**Rules the contract leaves open, decided in the code (the team to confirm)**

- *Duplicate booking (the 409 on `POST`):* a second **pending** booking with the same `courseId` and the same `eventName`, ignoring case and surrounding spaces. Once the first booking is confirmed, declined or cancelled, the event can be booked again. Enforced in the database, so two simultaneous requests cannot both succeed.
- *Order of checks:* a body that fails validation answers 400 before anything else is looked up (a bad body for an unknown course or booking is 400, not 404); then 404, then 409.
- *`preferredStart` input:* any RFC 3339 date-time with a `Z` or an offset is accepted and answered as UTC with a `Z` and no milliseconds; a date with no time, a time with no zone, or a day that does not exist (30 February) is 400.
- *`eventName`* is trimmed and must be 1 to 120 characters. *`PUT`* cannot change the event or the course: those fields are unknown to it, so sending them is 400.
- *Ids* are unique and increasing but not gap-free on PostgreSQL: a refused write can skip a number.

TODO (the team): confirm that `openapi.yaml` 0.1.0 is the version handed off to Sherehe, and decide on the 413 entry above. If it was handed off, a 413 addition is an entry in the format at the end of this file.

## Entry format

For each change:

**Endpoint N, `METHOD /path` (need)**
What changed: ...
Why the original did not hold up: ...
Flagged to Sherehe: date and how.
