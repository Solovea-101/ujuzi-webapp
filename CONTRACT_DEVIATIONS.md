# Ujuzi API: Contract Deviations

Every change made to `openapi.yaml` after it is handed off to Sherehe in Week 4: what changed, and why the original did not hold up. Endpoint numbers match ENDPOINT_LIST.md. Every change that affects a client is flagged to Sherehe before it is deployed, and `info.version` goes up.

## Week 5: GET endpoints

Endpoints 1, 2, 3 and 5 (`GET /api/courses`, `GET /api/courses/{courseId}`, `GET /api/certificates/{certificateNo}`, `GET /api/bookings/{bookingId}`) were checked against `openapi.yaml` version 0.1.0 by `npm run verify`: 17 requests, good and bad input, every answer compared field by field (status, exact field names, types, enums, date-time format, no extra and no missing fields). All 17 matched. The evidence is in VERIFICATION.md.

Not built yet when these GETs were first verified, and not a change to the contract: the `401` that `openapi.yaml` documents on every partner endpoint (missing `X-API-Key`). **Update: built since (R4).** Every partner endpoint now answers `401 { "message": "Send your partner key as X-API-Key" }` without a valid key, and `npm run verify` and `__tests__/partnerKeys.test.ts` prove it for all seven operations.

TODO (the team): confirm that `openapi.yaml` 0.1.0 is the version handed off to Sherehe. If it is, finish this section with "No deviations: every GET matched the contract as handed off." If the handed-off version differs, list each difference below in the entry format at the end of this file.

## Week 6: write endpoints

Endpoints 4, 6 and 7 (`POST /api/bookings`, `PUT /api/bookings/{bookingId}`, `DELETE /api/bookings/{bookingId}`) were checked against `openapi.yaml` version 0.1.0 by `npm run verify`: 28 requests, good and bad input. Every answer matched the contract field by field, every successful write was re-fetched with a GET to confirm it, and every rejected write was shown to have changed nothing. The evidence is in VERIFICATION.md. Endpoint 24 (`PATCH`, staff) is not built: it needs the staff login.

**Found while building**

- **`413` was not documented.** A body over 20 KB answers `413 { "message": "Request body must be 20 KB or less" }` on `POST`, `PUT` and `PATCH`, and the README's error table lists 413, but `openapi.yaml` 0.1.0 documented no 413. Fixed in 0.1.1 (see "After handoff" below), and `npm run verify` now checks it.
- **The `401` was not enforced yet**, as under Week 5. It is now (see the update under Week 5).

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

## After handoff: version 0.2.0

**Endpoints 8 to 23, the website endpoints (G1 to G5), added to the contract**
What changed: 16 operations are added, exactly the website rows of ENDPOINT_LIST.md: register, login, logout, me; enrol and list enrolments; job matches; apply, list, reschedule and withdraw Kazi applications; the applications WebSocket feed; staff create and replace a course; staff issue a certificate; staff list bookings. They come with 15 new schemas, a `userToken` security scheme, and new shared responses (`LoginRequired`, `InvalidLogin`, `BadGateway`, `UpgradeRequired`, `UnauthorizedEither`). `info.version` goes from 0.1.1 to 0.2.0, and the "TODO Week 4" line in the file header is gone.
Changes to what Sherehe already uses (all additive; no field, status code or behaviour of Endpoints 1 to 7 changes): `GET /api/courses`, `GET /api/courses/{courseId}` and `GET /api/certificates/{certificateNo}` now accept a partner key **or** a login token, because the website's browser pages cannot hold a partner key. Their 401 is described as "neither a partner key nor a login token". The `Unauthorized` response now says "partner key" only, `Forbidden` is described for all roles, and the `partnerKey` description no longer says "from Week 9". `PATCH /api/bookings/{bookingId}` (Endpoint 24) gains a description (only staff at the booking's centre; only a pending booking).
Why the original did not hold up: 0.1.x documented only the partner side, so the website's own endpoints, which CLAUDE.md and ENDPOINT_LIST.md list, had no contract to build or verify against.
Flagged to Sherehe: TODO. Nothing in 0.2.0 changes what Sherehe calls, but R8 says the team tells Sherehe's sub-team before any contract change is deployed. Nothing is deployed yet.

**Built so far under 0.2.0:** Endpoints 8, 9, 10, 11 (accounts), 12, 13 (enrolments), 20, 21 (staff courses), 22 (staff certificates), 23 (staff booking list) and 24 (staff decision). `npm run verify` checks each one against this contract (127 cases in all, every rejected write shown to change nothing). Endpoints 14 to 19 (job matches, Kazi applications, the live feed) are not built yet; they need the Kazi client.

**Rules the code applies where the contract is silent (the team to confirm):**
- *Order of checks* on every write: login (401), then body (400, 413), then the thing it names (404), then ownership (403), then state (409). For example, a staff member of another centre gets 403 for a booking that is already decided, not 409.
- *Accounts:* the email is lower-cased and trimmed and is unique ignoring case; the password is 8 to 128 characters with no other rule; names are 1 to 60 characters. A login token is valid for 7 days. A wrong password and an unknown email give the same 401 after the same amount of work. Logging out ends only that token. Register answers 409 for an email that is taken, which does reveal that the email has an account.
- *Staff invite code:* trimmed before it is compared, compared in constant time, and sign-up stays closed (403) when `STAFF_INVITE_CODE` is unset or empty.
- *Certificates* are numbered `UJZ-<current year>-NNNNN`, skipping numbers already taken, and keep the course title and level as they were the day they were issued.
- *Not built, noted as risks:* there is no rate limit or lockout on login, and no password reset.

Design choices made in the new endpoints (the team to confirm): staff accounts cannot be self-registered without the deployment's invite code (when none is configured, staff sign-up is closed); the WebSocket feed authenticates with a first message `{"type":"auth","token":...}` instead of a token in the URL; a withdrawn Kazi application stays in the graduate's list with status `cancelled`; `POST /api/courses` creates the course at the staff member's own centre.

TODO (the team): confirm whether `openapi.yaml` 0.1.0 had been handed off to Sherehe. If it had, the entry above is the record of the change; if not, this section can be folded into the original contract.

## Entry format

For each change:

**Endpoint N, `METHOD /path` (need)**
What changed: ...
Why the original did not hold up: ...
Flagged to Sherehe: date and how.
