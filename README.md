# Ujuzi API

Ujuzi is a REST API and website for skills training in Kenya. Training centres list short courses and issue certificates. **Sherehe** uses the API to show event organisers suitable courses, check a crew member's certificate, and book group training. Ujuzi in turn uses **Kazi Connect** to show graduates matching casual jobs, apply on their behalf, and follow each application live. It is built with Next.js, TypeScript and PostgreSQL.

| What | Where |
|---|---|
| Live API | TODO: https://<ujuzi>.onrender.com |
| Interactive docs (Swagger UI) | TODO: https://<ujuzi>.onrender.com/docs |
| The contract | TODO: https://<ujuzi>.onrender.com/openapi.yaml |
| Our upstream (Kazi Connect) | https://kaziconnect1-1xmu.onrender.com |
| Our downstream (Sherehe) | TODO: Sherehe's live URL |

> **Before your first request:** the API runs on a free server that sleeps after 15 minutes without visitors, so the first request after a quiet spell can take up to a minute. Wait for it.

> TODO before the Week 8 blind test: replace every example below with the real reply from the live API, and run every command yourself from a clean terminal exactly as written.

## Quickstart: one command

```bash
curl -s -w "\nHTTP %{http_code}\n" -H "X-API-Key: YOUR_KEY" "https://<ujuzi>.onrender.com/api/courses?category=catering&county=Nairobi"
```

You get back a JSON list of catering courses in Nairobi and `HTTP 200`.

## Authentication

- **Partner systems** (Sherehe) send `X-API-Key: YOUR_KEY` on every partner endpoint. Keys are issued per system by the Ujuzi team. TODO: how a tester gets a demo key.
- **Graduates and staff** on the website log in with `POST /api/auth/login`, then send `Authorization: Bearer YOUR_TOKEN`.

## One example per major endpoint

**List courses** (Endpoint 1, need S1)

```bash
curl -s -H "X-API-Key: YOUR_KEY" "https://<ujuzi>.onrender.com/api/courses?category=catering&county=Nairobi"
```

```json
[
  {
    "id": "crs_501",
    "title": "Food hygiene and event service",
    "category": "catering",
    "centre": { "id": "cen_11", "name": "Westlands Skills Centre" },
    "county": "Nairobi",
    "area": "Westlands",
    "durationWeeks": 2,
    "feeKes": 3500,
    "nextStart": "2026-11-23T07:00:00Z",
    "certificateLevel": "short-course"
  }
]
```

**Check a certificate** (Endpoint 3, need S2)

```bash
curl -s -H "X-API-Key: YOUR_KEY" https://<ujuzi>.onrender.com/api/certificates/UJZ-2026-00123
```

```json
{
  "certificateNo": "UJZ-2026-00123",
  "valid": true,
  "courseTitle": "Food hygiene and event service",
  "level": "short-course",
  "issuedOn": "2026-08-14",
  "holder": "Achieng O."
}
```

**Book crew training** (Endpoint 4, need S3): answers `201`

```bash
curl -s -X POST https://<ujuzi>.onrender.com/api/bookings \
  -H "X-API-Key: YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"courseId":"crs_501","crewSize":6,"preferredStart":"2026-11-28T08:00:00Z","eventName":"Wanjiku and Otieno wedding"}'
```

```json
{
  "id": "bkg_6001",
  "courseId": "crs_501",
  "eventName": "Wanjiku and Otieno wedding",
  "crewSize": 6,
  "preferredStart": "2026-11-28T08:00:00Z",
  "status": "pending",
  "createdAt": "2026-11-20T10:00:00Z"
}
```

**Check, change or cancel a booking** (Endpoints 5, 6, 7, needs S4 and S5)

```bash
curl -s -H "X-API-Key: YOUR_KEY" https://<ujuzi>.onrender.com/api/bookings/bkg_6001
curl -s -X PUT https://<ujuzi>.onrender.com/api/bookings/bkg_6001 -H "X-API-Key: YOUR_KEY" -H "Content-Type: application/json" -d '{"crewSize":8,"preferredStart":"2026-11-29T08:00:00Z"}'
curl -s -w "HTTP %{http_code}\n" -X DELETE -H "X-API-Key: YOUR_KEY" https://<ujuzi>.onrender.com/api/bookings/bkg_6001
```

The first answers the booking with its `status`, the second the updated booking, and the third `HTTP 204` with no body.

TODO: add examples for the website endpoints (register, log in, enrol, job matches, apply through Kazi, the live feed).

## Error reference

Every failure answers with one field, `message`, in plain English, and nothing is changed:

```json
{ "message": "Course crs_999 not found" }
```

| Code | Meaning | Example cause |
|---|---|---|
| 400 | The request is wrong | Missing field, wrong type, unknown field, a date in the past, a malformed certificate number |
| 401 | No valid key or token | Missing `X-API-Key`, or an expired login |
| 403 | Not allowed | Staff deciding another centre's booking |
| 404 | No such id | A mistyped id, or a cancelled booking |
| 409 | Not allowed in the current state | Changing or cancelling a confirmed booking; a duplicate pending booking |
| 413 | Body too large | More than 20 KB of JSON |
| 502 | Kazi Connect could not be reached | Kazi asleep or down; try again in a minute |

## Run the API on your own computer

You need Node.js 20.9 or newer (Next.js requires it) and Git.

```text
git clone TODO-repo-url
cd ujuzi-webapp
npm install
npm run build
npm start
```

Open http://localhost:3000/docs for the docs, or http://localhost:3000 for the website. With no settings, data is kept in memory and reset to sample data on every restart, so no database is needed.

To check everything works:

```text
npm run typecheck
npm test
npm run verify
```

Optional settings (environment variables): `DATABASE_URL`, `KAZI_API_URL` and `KAZI_WS_URL` (our upstream), `PARTNER_KEYS` (hashed keys we accept), `SESSION_SECRET`, `PORT` (default 3000). See `.env.example`.

## More documents

`TEAM_CHARTER.md`, `API_NEEDS.md`, `ENDPOINT_LIST.md`, `openapi.yaml`, `CONTRACT_QUESTIONS.md`, `CONTRACT_DEVIATIONS.md`, `VERIFICATION.md`, `PARTNER_TEST_RESULTS.md`, `BLIND_TEST_REPORT.md`.
