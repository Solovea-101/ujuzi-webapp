# Ujuzi API: Contract Verification

This file is written by `npm run verify` (`scripts/verifyContract.ts`). Do not edit it by hand.

The script starts the server with the in-memory store, sends real requests to every endpoint with good and bad input, and checks each real response against `openapi.yaml`: status code, exact field names, types, enums, date-time format, no extra fields and no missing fields. Every successful write is re-fetched with a GET to confirm the change, and every rejected write is checked to confirm nothing changed. Week 5 grades this as "evidence of systematic verification against the contract, not eyeballing".

## Latest run

- Contract: `openapi.yaml` version 0.2.0 (OpenAPI 3.0.3).
- Operations: 18 of 24 built, 6 not built yet.
- Cases: 127 sent, 127 passed, 0 failed.
- Result: **PASS**

"Fields checked" counts every field in the answer that was compared with the contract for its exact name, type, allowed values and format. Dates must be UTC with a Z and no milliseconds. A field the contract does not declare, or a declared field that is missing, fails the case.

## Cases

| Operation | Case | Request | Expected | Got | Fields checked | Then (re-fetch) | Result |
|---|---|---|---|---|---|---|---|
| `GET /api/courses` | every course | `/api/courses` | 200 | 200 | 108 |  | pass |
| `GET /api/courses` | by category | `/api/courses?category=catering` | 200 | 200 | 12 |  | pass |
| `GET /api/courses` | by county, in lower case | `/api/courses?county=nairobi` | 200 | 200 | 48 |  | pass |
| `GET /api/courses` | by category and county | `/api/courses?category=plumbing&county=Nairobi` | 200 | 200 | 12 |  | pass |
| `GET /api/courses` | nothing matches: [] with 200 | `/api/courses?category=plumbing&county=Mombasa` | 200 | 200 | 0 |  | pass |
| `GET /api/courses` | unknown category | `/api/courses?category=cooking` | 400 | 400 | 1 |  | pass |
| `GET /api/courses` | empty category | `/api/courses?category=` | 400 | 400 | 1 |  | pass |
| `GET /api/courses` | unknown county | `/api/courses?county=Narnia` | 400 | 400 | 1 |  | pass |
| `GET /api/courses/{courseId}` | existing course | `/api/courses/crs_501` | 200 | 200 | 12 |  | pass |
| `GET /api/courses/{courseId}` | unknown course | `/api/courses/crs_999` | 404 | 404 | 1 |  | pass |
| `GET /api/certificates/{certificateNo}` | valid certificate | `/api/certificates/UJZ-2026-00123` | 200 | 200 | 6 |  | pass |
| `GET /api/certificates/{certificateNo}` | revoked certificate | `/api/certificates/UJZ-2026-00124` | 200 | 200 | 6 |  | pass |
| `GET /api/certificates/{certificateNo}` | unknown number | `/api/certificates/UJZ-2026-99999` | 404 | 404 | 1 |  | pass |
| `GET /api/certificates/{certificateNo}` | malformed number | `/api/certificates/UJZ-26-123` | 400 | 400 | 1 |  | pass |
| `GET /api/bookings/{bookingId}` | pending booking | `/api/bookings/bkg_6001` | 200 | 200 | 7 |  | pass |
| `GET /api/bookings/{bookingId}` | confirmed booking | `/api/bookings/bkg_6002` | 200 | 200 | 7 |  | pass |
| `GET /api/bookings/{bookingId}` | unknown booking | `/api/bookings/bkg_9999` | 404 | 404 | 1 |  | pass |
| `POST /api/bookings` | creates a pending booking | `/api/bookings` | 201 | 201 | 7 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `POST /api/bookings` | the same event again: 409, nothing created | `/api/bookings` | 409 | 409 | 1 |  | pass |
| `POST /api/bookings` | the same event in another case: 409 | `/api/bookings` | 409 | 409 | 1 |  | pass |
| `POST /api/bookings` | unknown course: 404, nothing created | `/api/bookings` | 404 | 404 | 1 |  | pass |
| `POST /api/bookings` | empty body object | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | unknown field | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | crewSize 0 | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | crewSize 41 | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | crewSize 2.5 | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | crewSize as text | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | start in the past | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | start on 30 February | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | empty event name | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | event name of 121 characters | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | body is a list | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | body is not valid JSON | `/api/bookings` | 400 | 400 | 1 |  | pass |
| `POST /api/bookings` | body over 20 KB: 413, nothing created | `/api/bookings` | 413 | 413 | 1 |  | pass |
| `PUT /api/bookings/{bookingId}` | changes crew size and start date | `/api/bookings/bkg_6003` | 200 | 200 | 7 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `PUT /api/bookings/{bookingId}` | the same body again: same booking (idempotent) | `/api/bookings/bkg_6003` | 200 | 200 | 7 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `PUT /api/bookings/{bookingId}` | crewSize 0: 400, unchanged | `/api/bookings/bkg_6003` | 400 | 400 | 1 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `PUT /api/bookings/{bookingId}` | start in the past: 400, unchanged | `/api/bookings/bkg_6003` | 400 | 400 | 1 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `PUT /api/bookings/{bookingId}` | preferredStart missing: 400, unchanged | `/api/bookings/bkg_6003` | 400 | 400 | 1 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `PUT /api/bookings/{bookingId}` | tries to rename the event: 400, unchanged | `/api/bookings/bkg_6003` | 400 | 400 | 1 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `PUT /api/bookings/{bookingId}` | body over 20 KB: 413, unchanged | `/api/bookings/bkg_6003` | 413 | 413 | 1 | `GET /api/bookings/bkg_6003 -> 200` | pass |
| `PUT /api/bookings/{bookingId}` | unknown booking | `/api/bookings/bkg_9999` | 404 | 404 | 1 |  | pass |
| `PUT /api/bookings/{bookingId}` | confirmed booking: 409, unchanged | `/api/bookings/bkg_6002` | 409 | 409 | 1 | `GET /api/bookings/bkg_6002 -> 200` | pass |
| `DELETE /api/bookings/{bookingId}` | confirmed booking: 409, still there | `/api/bookings/bkg_6002` | 409 | 409 | 1 | `GET /api/bookings/bkg_6002 -> 200` | pass |
| `DELETE /api/bookings/{bookingId}` | unknown booking | `/api/bookings/bkg_9999` | 404 | 404 | 1 |  | pass |
| `DELETE /api/bookings/{bookingId}` | cancels a pending booking: 204, then it is gone | `/api/bookings/bkg_6003` | 204 | 204 | 0 | `GET /api/bookings/bkg_6003 -> 404` | pass |
| `DELETE /api/bookings/{bookingId}` | cancelling it again: 404 | `/api/bookings/bkg_6003` | 404 | 404 | 1 |  | pass |
| `GET /api/courses` | no key: 401 | `/api/courses` | 401 | 401 | 1 |  | pass |
| `GET /api/courses` | a key we never issued: 401 | `/api/courses` | 401 | 401 | 1 |  | pass |
| `GET /api/courses/{courseId}` | no key: 401 | `/api/courses/crs_501` | 401 | 401 | 1 |  | pass |
| `GET /api/certificates/{certificateNo}` | no key: 401 | `/api/certificates/UJZ-2026-00123` | 401 | 401 | 1 |  | pass |
| `GET /api/bookings/{bookingId}` | no key: 401 | `/api/bookings/bkg_6001` | 401 | 401 | 1 |  | pass |
| `POST /api/bookings` | no key: 401, nothing created | `/api/bookings` | 401 | 401 | 1 |  | pass |
| `POST /api/bookings` | a key we never issued: 401, nothing created | `/api/bookings` | 401 | 401 | 1 |  | pass |
| `POST /api/bookings` | no key and a body that is not JSON: 401, not 400 | `/api/bookings` | 401 | 401 | 1 |  | pass |
| `PUT /api/bookings/{bookingId}` | no key: 401, unchanged | `/api/bookings/bkg_6001` | 401 | 401 | 1 | `GET /api/bookings/bkg_6001 -> 200` | pass |
| `DELETE /api/bookings/{bookingId}` | no key: 401, still there | `/api/bookings/bkg_6001` | 401 | 401 | 1 | `GET /api/bookings/bkg_6001 -> 200` | pass |
| `POST /api/auth/register` | creates a graduate account and logs it in | `/api/auth/register` | 201 | 201 | 9 | `GET /api/me -> 200` | pass |
| `POST /api/auth/register` | the same email again, in another case: 409 | `/api/auth/register` | 409 | 409 | 1 |  | pass |
| `POST /api/auth/register` | staff sign-up with no invite code configured: 403, nothing created | `/api/auth/register` | 403 | 403 | 1 |  | pass |
| `POST /api/auth/register` | no fields: 400 | `/api/auth/register` | 400 | 400 | 1 |  | pass |
| `POST /api/auth/register` | password of 7 characters: 400, nothing created | `/api/auth/register` | 400 | 400 | 1 |  | pass |
| `POST /api/auth/register` | unknown role: 400 | `/api/auth/register` | 400 | 400 | 1 |  | pass |
| `POST /api/auth/register` | a graduate with a centreId: 400, nothing created | `/api/auth/register` | 400 | 400 | 1 |  | pass |
| `POST /api/auth/register` | body over 20 KB: 413 | `/api/auth/register` | 413 | 413 | 1 |  | pass |
| `POST /api/auth/login` | the seeded demo password | `/api/auth/login` | 200 | 200 | 9 | `GET /api/me -> 200` | pass |
| `POST /api/auth/login` | a wrong password: 401 | `/api/auth/login` | 401 | 401 | 1 |  | pass |
| `POST /api/auth/login` | an email with no account: 401 | `/api/auth/login` | 401 | 401 | 1 |  | pass |
| `POST /api/auth/login` | no fields: 400 | `/api/auth/login` | 400 | 400 | 1 |  | pass |
| `POST /api/auth/login` | body is not valid JSON: 400 | `/api/auth/login` | 400 | 400 | 1 |  | pass |
| `POST /api/auth/login` | body over 20 KB: 413 | `/api/auth/login` | 413 | 413 | 1 |  | pass |
| `GET /api/me` | a graduate | `/api/me` | 200 | 200 | 6 |  | pass |
| `GET /api/me` | a staff member | `/api/me` | 200 | 200 | 6 |  | pass |
| `GET /api/me` | no token: 401 | `/api/me` | 401 | 401 | 1 |  | pass |
| `GET /api/me` | a token we never issued: 401 | `/api/me` | 401 | 401 | 1 |  | pass |
| `POST /api/auth/logout` | logs out: 204, and the token stops working | `/api/auth/logout` | 204 | 204 | 0 | `GET /api/me -> 401` | pass |
| `POST /api/auth/logout` | no token: 401 | `/api/auth/logout` | 401 | 401 | 1 |  | pass |
| `GET /api/courses` | a login token instead of a key | `/api/courses` | 200 | 200 | 108 |  | pass |
| `GET /api/courses` | a token we never issued: 401 | `/api/courses` | 401 | 401 | 1 |  | pass |
| `GET /api/courses/{courseId}` | a login token instead of a key | `/api/courses/crs_501` | 200 | 200 | 12 |  | pass |
| `GET /api/certificates/{certificateNo}` | a login token instead of a key | `/api/certificates/UJZ-2026-00123` | 200 | 200 | 6 |  | pass |
| `POST /api/enrolments` | enrols a graduate: 201, and it is in their list | `/api/enrolments` | 201 | 201 | 5 | `GET /api/me/enrolments -> 200` | pass |
| `POST /api/enrolments` | enrolling again: 409 | `/api/enrolments` | 409 | 409 | 1 |  | pass |
| `POST /api/enrolments` | unknown course: 404 | `/api/enrolments` | 404 | 404 | 1 |  | pass |
| `POST /api/enrolments` | no courseId: 400 | `/api/enrolments` | 400 | 400 | 1 |  | pass |
| `POST /api/enrolments` | a staff member cannot enrol: 403 | `/api/enrolments` | 403 | 403 | 1 |  | pass |
| `POST /api/enrolments` | no token: 401 | `/api/enrolments` | 401 | 401 | 1 |  | pass |
| `POST /api/enrolments` | body over 20 KB: 413 | `/api/enrolments` | 413 | 413 | 1 |  | pass |
| `GET /api/me/enrolments` | a graduate with a certificate | `/api/me/enrolments` | 200 | 200 | 5 | `GET /api/me -> 200` | pass |
| `GET /api/me/enrolments` | a staff member has none to list: 403 | `/api/me/enrolments` | 403 | 403 | 1 |  | pass |
| `GET /api/me/enrolments` | no token: 401 | `/api/me/enrolments` | 401 | 401 | 1 |  | pass |
| `POST /api/courses` | creates a course at the staff member's centre | `/api/courses` | 201 | 201 | 12 | `GET /api/courses/crs_510 -> 200` | pass |
| `POST /api/courses` | tries to choose the centre: 400 | `/api/courses` | 400 | 400 | 1 |  | pass |
| `POST /api/courses` | an unknown category: 400 | `/api/courses` | 400 | 400 | 1 |  | pass |
| `POST /api/courses` | a start in the past: 400 | `/api/courses` | 400 | 400 | 1 |  | pass |
| `POST /api/courses` | no fields: 400 | `/api/courses` | 400 | 400 | 1 |  | pass |
| `POST /api/courses` | a graduate cannot: 403 | `/api/courses` | 403 | 403 | 1 |  | pass |
| `POST /api/courses` | no token: 401 | `/api/courses` | 401 | 401 | 1 |  | pass |
| `POST /api/courses` | body over 20 KB: 413 | `/api/courses` | 413 | 413 | 1 |  | pass |
| `PUT /api/courses/{courseId}` | replaces the details of its own centre's course | `/api/courses/crs_510` | 200 | 200 | 12 | `GET /api/courses/crs_510 -> 200` | pass |
| `PUT /api/courses/{courseId}` | the same body again: same course (idempotent) | `/api/courses/crs_510` | 200 | 200 | 12 | `GET /api/courses/crs_510 -> 200` | pass |
| `PUT /api/courses/{courseId}` | another centre's staff: 403, unchanged | `/api/courses/crs_510` | 403 | 403 | 1 | `GET /api/courses/crs_510 -> 200` | pass |
| `PUT /api/courses/{courseId}` | an invalid body: 400, unchanged | `/api/courses/crs_510` | 400 | 400 | 1 | `GET /api/courses/crs_510 -> 200` | pass |
| `PUT /api/courses/{courseId}` | unknown course: 404 | `/api/courses/crs_999` | 404 | 404 | 1 |  | pass |
| `PUT /api/courses/{courseId}` | a graduate cannot: 403 | `/api/courses/crs_501` | 403 | 403 | 1 |  | pass |
| `PUT /api/courses/{courseId}` | no token: 401 | `/api/courses/crs_501` | 401 | 401 | 1 |  | pass |
| `POST /api/certificates` | another centre's staff: 403, nothing issued | `/api/certificates` | 403 | 403 | 1 |  | pass |
| `POST /api/certificates` | issues a certificate for an enrolment at the staff member's centre | `/api/certificates` | 201 | 201 | 6 | `GET /api/certificates/UJZ-2026-00001 -> 200` | pass |
| `POST /api/certificates` | issuing again: 409 | `/api/certificates` | 409 | 409 | 1 |  | pass |
| `POST /api/certificates` | unknown enrolment: 404 | `/api/certificates` | 404 | 404 | 1 |  | pass |
| `POST /api/certificates` | no enrolmentId: 400 | `/api/certificates` | 400 | 400 | 1 |  | pass |
| `POST /api/certificates` | a graduate cannot: 403 | `/api/certificates` | 403 | 403 | 1 |  | pass |
| `POST /api/certificates` | no token: 401 | `/api/certificates` | 401 | 401 | 1 |  | pass |
| `POST /api/certificates` | body over 20 KB: 413 | `/api/certificates` | 413 | 413 | 1 |  | pass |
| `GET /api/bookings` | the centre's bookings | `/api/bookings` | 200 | 200 | 14 | `GET /api/bookings/bkg_6001 -> 200` | pass |
| `GET /api/bookings` | another centre sees none of them: [] with 200 | `/api/bookings` | 200 | 200 | 0 |  | pass |
| `GET /api/bookings` | a graduate cannot: 403 | `/api/bookings` | 403 | 403 | 1 |  | pass |
| `GET /api/bookings` | no token: 401 | `/api/bookings` | 401 | 401 | 1 |  | pass |
| `PATCH /api/bookings/{bookingId}` | another centre's staff: 403, unchanged | `/api/bookings/bkg_6001` | 403 | 403 | 1 | `GET /api/bookings/bkg_6001 -> 200` | pass |
| `PATCH /api/bookings/{bookingId}` | an invalid status: 400, unchanged | `/api/bookings/bkg_6001` | 400 | 400 | 1 | `GET /api/bookings/bkg_6001 -> 200` | pass |
| `PATCH /api/bookings/{bookingId}` | confirms a pending booking | `/api/bookings/bkg_6001` | 200 | 200 | 7 | `GET /api/bookings/bkg_6001 -> 200` | pass |
| `PATCH /api/bookings/{bookingId}` | deciding again: 409 | `/api/bookings/bkg_6001` | 409 | 409 | 1 | `GET /api/bookings/bkg_6001 -> 200` | pass |
| `PATCH /api/bookings/{bookingId}` | unknown booking: 404 | `/api/bookings/bkg_9999` | 404 | 404 | 1 |  | pass |
| `PATCH /api/bookings/{bookingId}` | a graduate cannot: 403 | `/api/bookings/bkg_6002` | 403 | 403 | 1 |  | pass |
| `PATCH /api/bookings/{bookingId}` | no token: 401 | `/api/bookings/bkg_6002` | 401 | 401 | 1 |  | pass |
| `PATCH /api/bookings/{bookingId}` | a partner key is not a login: 401 | `/api/bookings/bkg_6002` | 401 | 401 | 1 |  | pass |
| `PATCH /api/bookings/{bookingId}` | body over 20 KB: 413 | `/api/bookings/bkg_6002` | 413 | 413 | 1 |  | pass |

## Not built yet

- `GET /api/courses/{courseId}/job-matches`
- `GET /api/me/applications`
- `POST /api/me/applications`
- `GET /api/me/applications/feed`
- `PUT /api/me/applications/{id}`
- `DELETE /api/me/applications/{id}`
