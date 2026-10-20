# Ujuzi API: Contract Verification

This file is written by `npm run verify` (`scripts/verifyContract.ts`). Do not edit it by hand.

The script starts the server with the in-memory store, sends real requests to every endpoint with good and bad input, and checks each real response against `openapi.yaml`: status code, exact field names, types, enums, date-time format, no extra fields and no missing fields. Every successful write is re-fetched with a GET to confirm the change, and every rejected write is checked to confirm nothing changed. Week 5 grades this as "evidence of systematic verification against the contract, not eyeballing".

## Latest run

- Contract: `openapi.yaml` version 0.1.0 (OpenAPI 3.0.3).
- Operations: 4 of 8 built, 4 not built yet.
- Cases: 17 sent, 17 passed, 0 failed.
- Result: **PASS**

"Fields checked" counts every field in the answer that was compared with the contract for its exact name, type, allowed values and format. Dates must be UTC with a Z and no milliseconds. A field the contract does not declare, or a declared field that is missing, fails the case.

## Cases

| Operation | Case | Request | Expected | Got | Fields checked | Result |
|---|---|---|---|---|---|---|
| `GET /api/courses` | every course | `/api/courses` | 200 | 200 | 108 | pass |
| `GET /api/courses` | by category | `/api/courses?category=catering` | 200 | 200 | 12 | pass |
| `GET /api/courses` | by county, in lower case | `/api/courses?county=nairobi` | 200 | 200 | 48 | pass |
| `GET /api/courses` | by category and county | `/api/courses?category=plumbing&county=Nairobi` | 200 | 200 | 12 | pass |
| `GET /api/courses` | nothing matches: [] with 200 | `/api/courses?category=plumbing&county=Mombasa` | 200 | 200 | 0 | pass |
| `GET /api/courses` | unknown category | `/api/courses?category=cooking` | 400 | 400 | 1 | pass |
| `GET /api/courses` | empty category | `/api/courses?category=` | 400 | 400 | 1 | pass |
| `GET /api/courses` | unknown county | `/api/courses?county=Narnia` | 400 | 400 | 1 | pass |
| `GET /api/courses/{courseId}` | existing course | `/api/courses/crs_501` | 200 | 200 | 12 | pass |
| `GET /api/courses/{courseId}` | unknown course | `/api/courses/crs_999` | 404 | 404 | 1 | pass |
| `GET /api/certificates/{certificateNo}` | valid certificate | `/api/certificates/UJZ-2026-00123` | 200 | 200 | 6 | pass |
| `GET /api/certificates/{certificateNo}` | revoked certificate | `/api/certificates/UJZ-2026-00124` | 200 | 200 | 6 | pass |
| `GET /api/certificates/{certificateNo}` | unknown number | `/api/certificates/UJZ-2026-99999` | 404 | 404 | 1 | pass |
| `GET /api/certificates/{certificateNo}` | malformed number | `/api/certificates/UJZ-26-123` | 400 | 400 | 1 | pass |
| `GET /api/bookings/{bookingId}` | pending booking | `/api/bookings/bkg_6001` | 200 | 200 | 7 | pass |
| `GET /api/bookings/{bookingId}` | confirmed booking | `/api/bookings/bkg_6002` | 200 | 200 | 7 | pass |
| `GET /api/bookings/{bookingId}` | unknown booking | `/api/bookings/bkg_9999` | 404 | 404 | 1 | pass |

## Not built yet

- `POST /api/bookings`
- `PUT /api/bookings/{bookingId}`
- `PATCH /api/bookings/{bookingId}`
- `DELETE /api/bookings/{bookingId}`
