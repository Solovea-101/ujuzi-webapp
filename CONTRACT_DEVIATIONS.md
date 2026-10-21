# Ujuzi API: Contract Deviations

Every change made to `openapi.yaml` after it is handed off to Sherehe in Week 4: what changed, and why the original did not hold up. Endpoint numbers match ENDPOINT_LIST.md. Every change that affects a client is flagged to Sherehe before it is deployed, and `info.version` goes up.

## Week 5: GET endpoints

Endpoints 1, 2, 3 and 5 (`GET /api/courses`, `GET /api/courses/{courseId}`, `GET /api/certificates/{certificateNo}`, `GET /api/bookings/{bookingId}`) were checked against `openapi.yaml` version 0.1.0 by `npm run verify`: 17 requests, good and bad input, every answer compared field by field (status, exact field names, types, enums, date-time format, no extra and no missing fields). All 17 matched. The evidence is in VERIFICATION.md.

Not built yet, and not a change to the contract: the `401` that `openapi.yaml` documents on every partner endpoint (missing `X-API-Key`). Key checking is the Week 9 task (R4), so until then these GETs answer without a key.

TODO (the team): confirm that `openapi.yaml` 0.1.0 is the version handed off to Sherehe. If it is, finish this section with "No deviations: every GET matched the contract as handed off." If the handed-off version differs, list each difference below in the entry format at the end of this file.

## Week 6: write endpoints

TODO, same rule.

## Entry format

For each change:

**Endpoint N, `METHOD /path` (need)**
What changed: ...
Why the original did not hold up: ...
Flagged to Sherehe: date and how.
