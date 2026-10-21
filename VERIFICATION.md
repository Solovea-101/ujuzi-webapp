# Ujuzi API: Contract Verification

This file is written by `npm run verify` (`scripts/verifyContract.ts`). Do not edit it by hand.

The script starts the server with the in-memory store, sends real requests to every endpoint with good and bad input, and checks each real response against `openapi.yaml`: status code, exact field names, types, enums, date-time format, no extra fields and no missing fields. Every successful write is re-fetched with a GET to confirm the change, and every rejected write is checked to confirm nothing changed. Week 5 grades this as "evidence of systematic verification against the contract, not eyeballing".

## Latest run

- Contract: `openapi.yaml` version 0.1.1 (OpenAPI 3.0.3).
- Operations: 7 of 8 built, 1 not built yet.
- Cases: 47 sent, 47 passed, 0 failed.
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

## Not built yet

- `PATCH /api/bookings/{bookingId}`
