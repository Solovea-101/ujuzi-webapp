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

**Built under 0.2.0:** all 24 operations. `npm run verify` (now strict: an unbuilt operation fails it) checks each against this contract, 164 cases in all, every rejected write shown to change nothing. Endpoints 14 to 19 (job matches, Kazi applications, the live feed) read Kazi Connect through `lib/clients/kaziClient.ts` only, typed from `partner-tests/kazi_openapi.yaml`, and are tested against a local fake Kazi (`__tests__/helpers/kaziStub.ts`), never the real one.

**Rules the code applies where the contract is silent (the team to confirm):**
- *Order of checks* on every write: login (401), then body (400, 413), then the thing it names (404), then ownership (403), then state (409). For example, a staff member of another centre gets 403 for a booking that is already decided, not 409.
- *Accounts:* the email is lower-cased and trimmed and is unique ignoring case; the password is 8 to 128 characters with no other rule; names are 1 to 60 characters. A login token is valid for 7 days. A wrong password and an unknown email give the same 401 after the same amount of work. Logging out ends only that token. Register answers 409 for an email that is taken, which does reveal that the email has an account.
- *Staff invite code:* trimmed before it is compared, compared in constant time, and sign-up stays closed (403) when `STAFF_INVITE_CODE` is unset or empty.
- *Certificates* are numbered `UJZ-<current year>-NNNNN`, skipping numbers already taken, and keep the course title and level as they were the day they were issued.
- *Kazi-facing endpoints:* a Kazi that is down, too slow (10 s when a user waits) or answering something unusable is our own `502 { "message": "Kazi Connect could not be reached. Try again in a minute." }` and changes nothing; every other endpoint keeps working. A Kazi 400 or 409 on an application becomes our own 400 or 409 in our own words. Job reads are cached for 5 minutes. Pay is shown as whole shillings (Kazi's decimals are rounded). A Kazi job whose category is outside the shared list is left out.
- *Applications:* Ujuzi sends Kazi only the graduate's Ujuzi id (`grd_0101`) as `studentId`, never a name, email or phone. A withdrawn application stays in the graduate's list as `cancelled`; if Kazi has already lost an application, withdrawing it counts as done. Someone else's application is a 404, not a 403. If Kazi accepts an application but Ujuzi then cannot save it, Ujuzi withdraws it at Kazi again. A status only moves forward: once accepted, filled or cancelled it never changes.
- *Live status:* one WebSocket per pending application, reconnecting after 1 s, 2 s, 4 s ... up to a minute, plus a poll every 2 minutes in case the socket is silent; it stops at a final status and resumes every pending application when the server starts. The feed socket is authenticated by its first message and closed with code 4401 if that is missing, late (5 s), bad, or a staff token.
- *Not built, noted as risks:* there is no password reset, and no lockout of an account (sign-in is rate limited per address since 0.3.0, see below).

Design choices made in the new endpoints (the team to confirm): staff accounts cannot be self-registered without the deployment's invite code (when none is configured, staff sign-up is closed); the WebSocket feed authenticates with a first message `{"type":"auth","token":...}` instead of a token in the URL; a withdrawn Kazi application stays in the graduate's list with status `cancelled`; `POST /api/courses` creates the course at the staff member's own centre.

TODO (the team): confirm whether `openapi.yaml` 0.1.0 had been handed off to Sherehe. If it had, the entry above is the record of the change; if not, this section can be folded into the original contract.

## After handoff: version 0.3.0

**All 24 operations, a `429 Too Many Requests` response (Week 9)**
What changed: every operation documents a `429` (shared response `TooManyRequests`: a `Retry-After` header in seconds and the usual `{ "message": "..." }` body). `info.description` states the limits: 100 requests a minute per partner key, 120 a minute per client address for everything else, 10 a minute per address on `POST /api/auth/login` and `/register`. The `partnerKey` scheme says the key goes in the `X-API-Key` header. `info.version` goes from 0.2.0 to 0.3.0. No field, existing status code or existing behaviour changes; a caller that stays under the limits sees no difference.
Why the original did not hold up: 0.2.0 said nothing about being refused for sending too much, so a partner's client could not know that a `429` can come, that `Retry-After` says how long to wait, or what the limits are.
Also changed in the code, not the contract: a URL with broken percent-encoding (for example `/api/courses/%E0%A4%A`) now answers `400 { "message": "The URL is not valid." }` instead of Next's bare plain-text 500, and `POST /api/me/applications` refuses a `jobId` containing anything but letters, digits, `_` and `-` with the existing 400 message, instead of passing it on to Kazi. Both are inside the documented `400`. Found by `npm run security:probe` (SECURITY_AUDIT.md).
Flagged to Sherehe: TODO. R8 says the team tells Sherehe's sub-team before this is deployed; Sherehe's client must treat a `429` as "wait `Retry-After` seconds, then retry". Nothing is deployed yet. (Sherehe's side had already taken 0.1.1 and 0.2.0 into its frozen copy on 2026-10-27; its pull request for that is not merged.)

## After handoff: version 0.4.0

**Endpoint 25, `POST /api/auth/password` (new); Endpoints 5, 6 and 7 (S4, S5): a booking belongs to the key that made it; login and the password change: a lock after repeated wrong passwords**
What changed: one new operation, `POST /api/auth/password` (a logged in user changes their own password; `204`, `400`, `401`, `403`, `413`, `429`), with a `PasswordChange` schema. The description now says that a booking belongs to the partner whose key created it, that another partner's key gets `404` on read, change and cancel, that five wrong passwords in a row for one email lock that address for 15 minutes (`429` with `Retry-After`, kept in the database), and that a URL which does not accept the method answers `405 { "message" }` and broken percent-encoding answers `400`. `TooManyRequests` says it can also mean a locked email. `info.version` goes from 0.3.0 to 0.4.0.
What Sherehe notices: nothing, with one key. Sherehe's calls to Endpoints 1 to 7 are unchanged, and the bookings it made before this change are filed under `sherehe` by the migration. The one requirement is on our side of the key: `PARTNER_KEYS` entries are now `name:hash`, and Sherehe's must be named `sherehe` to see the bookings made before the change (an unnamed entry is named `default`). A second partner would get its own name and could not see Sherehe's bookings, and the duplicate-booking rule (one pending booking per course and event name) now applies per partner.
Why the original did not hold up: 0.3.0 let any issued key read, change or cancel any booking by its id, which is only safe while there is one partner; and it said nothing about password guessing beyond a per-address rate, which one person with many addresses gets round.
Flagged to Sherehe: 2026-10-27, in the ring conversation, the Sherehe agent was told that bookings are scoped by key and that 429 can come. On 2026-10-28 the Sherehe agent reported that its saved copy of our contract is now 0.4.0, identical to what Ujuzi serves, recorded in Sherehe's own CONTRACT_DEVIATIONS.md, with its types regenerated, and that its user approved the replacement. That is Sherehe's report; it was not seen on their side from here. Its partner suite against Ujuzi (writes included) passed 33 with 1 todo, and its ring:e2e passed all 11 Sherehe-to-Ujuzi steps. Nothing in 0.4.0 is deployed to Render yet; the team still confirms Sherehe's sub-team knows before that (R8).
Not in the contract (code only): the proxy settings `TRUST_PROXY_HOPS` and `LOG_CLIENT_ADDRESS`, `Cache-Control: no-store`, the security headers.

## Entry format

For each change:

**Endpoint N, `METHOD /path` (need)**
What changed: ...
Why the original did not hold up: ...
Flagged to Sherehe: date and how.
