# Ujuzi API: Contract Verification

This file is written by `npm run verify` (`scripts/verifyContract.ts`). Do not edit it by hand.

The script starts the server with the in-memory store, sends real requests to every endpoint with good and bad input, and checks each real response against `openapi.yaml`: status code, exact field names, types, enums, date-time format, no extra fields and no missing fields. Every successful write is re-fetched with a GET to confirm the change, and every rejected write is checked to confirm nothing changed. Week 5 grades this as "evidence of systematic verification against the contract, not eyeballing".

## Latest run

- Contract: `openapi.yaml` version 0.3.0 (OpenAPI 3.0.3).
- Operations: 24 of 24 built, 0 not built yet.
- Cases: 174 sent, 174 passed, 0 failed.
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
| `GET /api/courses/{courseId}/job-matches` | the active catering jobs in Nairobi | `/api/courses/crs_501/job-matches` | 200 | 200 | 20 |  | pass |
| `GET /api/courses/{courseId}/job-matches` | another county, in lower case | `/api/courses/crs_505/job-matches?county=kiambu` | 200 | 200 | 10 |  | pass |
| `GET /api/courses/{courseId}/job-matches` | nothing matches: [] with 200 | `/api/courses/crs_509/job-matches` | 200 | 200 | 0 |  | pass |
| `GET /api/courses/{courseId}/job-matches` | an unknown county: 400 | `/api/courses/crs_501/job-matches?county=Narnia` | 400 | 400 | 1 |  | pass |
| `GET /api/courses/{courseId}/job-matches` | an unknown course: 404 | `/api/courses/crs_999/job-matches` | 404 | 404 | 1 |  | pass |
| `GET /api/courses/{courseId}/job-matches` | no token: 401 | `/api/courses/crs_501/job-matches` | 401 | 401 | 1 |  | pass |
| `GET /api/courses/{courseId}/job-matches` | Kazi down: our own 502 | `/api/courses/crs_502/job-matches` | 502 | 502 | 1 |  | pass |
| `POST /api/me/applications` | applies for a job at Kazi: 201, saved, in the list | `/api/me/applications` | 201 | 201 | 6 | `GET /api/me/applications -> 200` | pass |
| `POST /api/me/applications` | a second application, to withdraw later | `/api/me/applications` | 201 | 201 | 6 |  | pass |
| `POST /api/me/applications` | a closed job: our own 409 | `/api/me/applications` | 409 | 409 | 1 |  | pass |
| `POST /api/me/applications` | a job Kazi does not know: our own 400 | `/api/me/applications` | 400 | 400 | 1 |  | pass |
| `POST /api/me/applications` | no fields: 400 | `/api/me/applications` | 400 | 400 | 1 |  | pass |
| `POST /api/me/applications` | a date in the past: 400 | `/api/me/applications` | 400 | 400 | 1 |  | pass |
| `POST /api/me/applications` | the studentId cannot be chosen: 400 | `/api/me/applications` | 400 | 400 | 1 |  | pass |
| `POST /api/me/applications` | a staff member cannot apply: 403 | `/api/me/applications` | 403 | 403 | 1 |  | pass |
| `POST /api/me/applications` | no token: 401 | `/api/me/applications` | 401 | 401 | 1 |  | pass |
| `POST /api/me/applications` | body over 20 KB: 413 | `/api/me/applications` | 413 | 413 | 1 |  | pass |
| `POST /api/me/applications` | Kazi down: our own 502 | `/api/me/applications` | 502 | 502 | 1 |  | pass |
| `GET /api/me/applications` | the graduate's applications | `/api/me/applications` | 200 | 200 | 12 |  | pass |
| `GET /api/me/applications` | another graduate has none: [] with 200 | `/api/me/applications` | 200 | 200 | 0 |  | pass |
| `GET /api/me/applications` | a staff member cannot: 403 | `/api/me/applications` | 403 | 403 | 1 |  | pass |
| `GET /api/me/applications` | no token: 401 | `/api/me/applications` | 401 | 401 | 1 |  | pass |
| `PUT /api/me/applications/{id}` | reschedules a pending application | `/api/me/applications/app_1005` | 200 | 200 | 6 | `GET /api/me/applications -> 200` | pass |
| `PUT /api/me/applications/{id}` | someone else's application: 404, unchanged | `/api/me/applications/app_1005` | 404 | 404 | 1 | `GET /api/me/applications -> 200` | pass |
| `PUT /api/me/applications/{id}` | a date in the past: 400, unchanged | `/api/me/applications/app_1005` | 400 | 400 | 1 | `GET /api/me/applications -> 200` | pass |
| `PUT /api/me/applications/{id}` | an unknown application: 404 | `/api/me/applications/app_9999` | 404 | 404 | 1 |  | pass |
| `PUT /api/me/applications/{id}` | a staff member cannot: 403 | `/api/me/applications/app_1005` | 403 | 403 | 1 |  | pass |
| `PUT /api/me/applications/{id}` | no token: 401 | `/api/me/applications/app_1005` | 401 | 401 | 1 |  | pass |
| `PUT /api/me/applications/{id}` | Kazi down: our own 502, unchanged | `/api/me/applications/app_1005` | 502 | 502 | 1 | `GET /api/me/applications -> 200` | pass |
| `DELETE /api/me/applications/{id}` | someone else's application: 404, still there | `/api/me/applications/app_1006` | 404 | 404 | 1 | `GET /api/me/applications -> 200` | pass |
| `DELETE /api/me/applications/{id}` | Kazi down: our own 502, still pending | `/api/me/applications/app_1006` | 502 | 502 | 1 | `GET /api/me/applications -> 200` | pass |
| `DELETE /api/me/applications/{id}` | withdraws a pending application: 204, kept as cancelled | `/api/me/applications/app_1006` | 204 | 204 | 0 | `GET /api/me/applications -> 200` | pass |
| `DELETE /api/me/applications/{id}` | withdrawing it again: 409 | `/api/me/applications/app_1006` | 409 | 409 | 1 |  | pass |
| `DELETE /api/me/applications/{id}` | an unknown application: 404 | `/api/me/applications/app_9999` | 404 | 404 | 1 |  | pass |
| `DELETE /api/me/applications/{id}` | a staff member cannot: 403 | `/api/me/applications/app_1005` | 403 | 403 | 1 |  | pass |
| `DELETE /api/me/applications/{id}` | no token: 401 | `/api/me/applications/app_1005` | 401 | 401 | 1 |  | pass |
| `GET /api/me/applications/feed` | plain HTTP: 426, it is a WebSocket | `/api/me/applications/feed` | 426 | 426 | 1 |  | pass |
| `GET /api/courses` | rate limit 3 a minute: 1st request is 200 | `/api/courses` | 200 | 200 | 120 |  | pass |
| `GET /api/courses` | rate limit: 2nd request is 200 | `/api/courses` | 200 | 200 | 120 |  | pass |
| `GET /api/courses` | rate limit: 3rd request is 200 | `/api/courses` | 200 | 200 | 120 |  | pass |
| `GET /api/courses` | rate limit: 4th request is 429 with Retry-After | `/api/courses` | 429 | 429 | 1 |  | pass |
| `POST /api/bookings` | rate limit: refused before it is validated or created: 429, nothing created | `/api/bookings` | 429 | 429 | 1 |  | pass |
| `GET /api/courses` | the key used above is the only one limited: the main key still gets 200 | `/api/courses` | 200 | 200 | 120 |  | pass |
| `POST /api/auth/login` | sign-in limit 2 a minute: 1st wrong password is 401 | `/api/auth/login` | 401 | 401 | 1 |  | pass |
| `POST /api/auth/login` | sign-in limit: 2nd wrong password is 401 | `/api/auth/login` | 401 | 401 | 1 |  | pass |
| `POST /api/auth/login` | sign-in limit: the 3rd attempt is 429, even with the right password | `/api/auth/login` | 429 | 429 | 1 |  | pass |
| `GET /api/me` | restored: the limits are back to normal | `/api/me` | 200 | 200 | 6 |  | pass |

## Not built yet

Every operation in the contract is built.
