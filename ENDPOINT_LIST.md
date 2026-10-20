# ENDPOINT_LIST.md: Ujuzi

Every endpoint traces back to a statement in API_NEEDS.md. Paths are nouns, verbs carry the action, ids sit in the path, filters in the query, and nothing nests more than one level below its parent resource.

## Endpoints Ujuzi provides to Sherehe

| # | Method | Path | Purpose | Maps to Need |
|---|---|---|---|---|
| 1 | GET | `/api/courses?category={category}&county={county}` | Lists courses, optionally by category and county | S1 |
| 2 | GET | `/api/courses/{courseId}` | Returns one course | S1 |
| 3 | GET | `/api/certificates/{certificateNo}` | Checks a certificate: valid, course, level, holder's first name and initial | S2 |
| 4 | POST | `/api/bookings` | Creates a group training booking, as pending | S3 |
| 5 | GET | `/api/bookings/{bookingId}` | Returns a booking and its status | S4 |
| 6 | PUT | `/api/bookings/{bookingId}` | Replaces crew size and start date of a pending booking | S5 |
| 7 | DELETE | `/api/bookings/{bookingId}` | Cancels a pending booking | S5 |

## Endpoints for the Ujuzi website

| # | Method | Path | Purpose | Maps to Need |
|---|---|---|---|---|
| 8 | POST | `/api/auth/register` | Creates a graduate or staff account and logs it in | G1 |
| 9 | POST | `/api/auth/login` | Logs in and returns a token | G1 |
| 10 | POST | `/api/auth/logout` | Logs out, so the token stops working | G1 |
| 11 | GET | `/api/me` | Returns the logged in user | G1 |
| 12 | POST | `/api/enrolments` | Enrols the logged in graduate in a course | G2 |
| 13 | GET | `/api/me/enrolments` | Lists the graduate's enrolments and certificates | G2 |
| 14 | GET | `/api/courses/{courseId}/job-matches?county={county}` | Lists active Kazi jobs in the course's category, read through Kazi | G3 (U1, U2, U3) |
| 15 | POST | `/api/me/applications` | Applies for a Kazi job for the graduate | G3 (U4) |
| 16 | GET | `/api/me/applications` | Lists the graduate's Kazi applications with their latest status | G3 (U5) |
| 17 | PUT | `/api/me/applications/{id}` | Reschedules a pending application (`id` is Kazi's applicationId) | G3 (U6) |
| 18 | DELETE | `/api/me/applications/{id}` | Withdraws a pending application | G3 (U6) |
| 19 | GET | `/api/me/applications/feed` | WebSocket: pushes each saved status change to the graduate | G3 (U5) |
| 20 | POST | `/api/courses` | Staff create a course | G4 |
| 21 | PUT | `/api/courses/{courseId}` | Staff replace a course's details | G4 |
| 22 | POST | `/api/certificates` | Staff issue a certificate | G4 |
| 23 | GET | `/api/bookings` | Staff list bookings for their centre | G5 |
| 24 | PATCH | `/api/bookings/{bookingId}` | Staff confirm or decline a booking | G5, S4 |

Minimums from the Week 3 handout: 24 endpoints (at least 5) and 11 writes (at least 1).

## Notes on design choices

- Job matches are nested under the course (`/api/courses/{courseId}/job-matches`) because they only exist in the context of one course's category; the county is a filter.
- The graduate's applications live under `/api/me/` because they act for the logged in graduate; `/api/bookings` is Sherehe's partner resource and has no `me` scope.
- Endpoint 19 is a `GET` that upgrades to a WebSocket, following the same pattern as Kazi Connect's endpoint 6.
- The certificate check is a `GET` on the certificate itself, not a verb such as `/verify-certificate`.

## Peer review (Week 3, Part C)

Reviewed by: TODO (a team outside our ring; in a three-system ring that means outside Sherehe, Kazi Connect and Ujuzi)

| Reviewer comment | Row | Our response: fixed, or why we kept it |
|---|---|---|
| TODO | | |

The handout checks for visible revision: every comment is either fixed or answered in writing.
