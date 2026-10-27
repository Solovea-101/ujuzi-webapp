# Ujuzi API

Ujuzi is a REST API and website for skills training in Kenya. Training centres list short courses and issue certificates. **Sherehe** uses the API to show event organisers suitable courses, check a crew member's certificate, and book group training. Ujuzi in turn uses **Kazi Connect** to show graduates matching casual jobs, apply on their behalf, and follow each application live. It is built with Next.js, TypeScript and PostgreSQL.

| What | Where |
|---|---|
| Live API | TODO: https://<ujuzi>.onrender.com |
| Interactive docs (Swagger UI) | TODO: https://<ujuzi>.onrender.com/docs |
| The contract | TODO: https://<ujuzi>.onrender.com/openapi.yaml |
| Our upstream (Kazi Connect) | https://kaziconnect1-1xmu.onrender.com |
| Our downstream (Sherehe) | TODO: Sherehe's live URL |
| On your own computer | http://localhost:3000 (docs at `/docs`, contract at `/openapi.yaml`) |

> **Before your first request:** the API runs on a free server that sleeps after 15 minutes without visitors, so the first request after a quiet spell can take up to a minute. Wait for it.

> The examples below are real replies, copied from a running copy of this API on 2026-10-27 (the local ring, with the sample data). TODO before the Week 8 blind test: run every command once against the live URL and replace the replies if they differ.

## Quickstart: one command

You need Node.js 20.9 or newer. In one terminal, start the API with a throwaway key of your own (only the key's SHA-256 is given to the server):

```bash
git clone TODO-repo-url && cd ujuzi-webapp && npm install && npm run build
PARTNER_KEYS=$(printf %s demo-key | shasum -a 256 | cut -d' ' -f1) npm start
```

In a second terminal:

```bash
curl -s -w "\nHTTP %{http_code}\n" -H "X-API-Key: demo-key" "http://localhost:3000/api/courses?category=catering&county=Nairobi"
```

You get the catering courses in Nairobi and `HTTP 200`:

```json
[{"id":"crs_501","title":"Food hygiene and event service","category":"catering","centre":{"id":"cen_11","name":"Westlands Skills Centre"},"county":"Nairobi","area":"Westlands","durationWeeks":2,"feeKes":3500,"nextStart":"2026-11-23T07:00:00Z","certificateLevel":"short-course"}]
```

With no `DATABASE_URL` the data lives in memory and is reset to the sample data on every start, so no database is needed.

## Authentication

- **Partner systems** (Sherehe) send `X-API-Key: YOUR_KEY` on every partner call (Endpoints 1 to 7). Only a SHA-256 hash of each key is stored, in `PARTNER_KEYS` (Render's settings, never git). Make a key and its hash with `npm run key:issue -- sherehe`; give the partner the key once, put the hash in `PARTNER_KEYS`. With no key configured every partner call is a 401. TODO: how a tester gets a demo key for the live deployment.
- **Graduates and staff** on the website log in with `POST /api/auth/login` and then send `Authorization: Bearer YOUR_TOKEN`. A token is valid for 7 days and stops working at once on `POST /api/auth/logout`.
- The course and certificate reads accept either, because a browser cannot hold a partner key. The booking endpoints (`POST`, `PUT`, `DELETE`) take a partner key only; the staff endpoints take a login token only.
- **Sample logins** (fictional people, local and demo data only): graduates `achieng.otieno@example.com`, `brian.kamau@example.com`, `mwanaisha.juma@example.com`; one staff member per centre, for example `wanjiru.njeri@example.com` (Westlands, courses `crs_501` and `crs_502`). They all use the password `ujuzi-demo-pass` unless `SEED_PASSWORD` is set.

## One example per major endpoint

Replace `localhost:3000` with the live URL. `$KEY` is your partner key and `$TOKEN` a login token.

**List courses** (Endpoint 1, need S1): the reply is shown above.

**Check a certificate** (Endpoint 3, need S2)

```bash
curl -s -H "X-API-Key: $KEY" http://localhost:3000/api/certificates/UJZ-2026-00123
```

```json
{"certificateNo":"UJZ-2026-00123","valid":true,"courseTitle":"Food hygiene and event service","level":"short-course","issuedOn":"2026-08-14","holder":"Achieng O."}
```

A revoked certificate answers `200` too, with `"valid":false` (try `UJZ-2026-00124`). The holder is only ever a first name and an initial.

**Book crew training** (Endpoint 4, need S3): answers `201` and a `Location` header

```bash
curl -s -i -X POST http://localhost:3000/api/bookings \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"courseId":"crs_501","crewSize":6,"preferredStart":"2026-11-26T17:21:49Z","eventName":"Wanjiku and Otieno wedding"}'
```

```text
HTTP/1.1 201 Created
location: /api/bookings/bkg_6008
```

```json
{"id":"bkg_6008","courseId":"crs_501","eventName":"Wanjiku and Otieno wedding","crewSize":6,"preferredStart":"2026-11-26T17:21:49Z","status":"pending","createdAt":"2026-10-27T17:21:49Z"}
```

`preferredStart` must be in the future. A second *pending* booking with the same course and event name (ignoring case) answers `409`.

**Check, change or cancel a booking** (Endpoints 5, 6, 7, needs S4 and S5)

```bash
curl -s -H "X-API-Key: $KEY" http://localhost:3000/api/bookings/bkg_6008
curl -s -X PUT http://localhost:3000/api/bookings/bkg_6008 -H "X-API-Key: $KEY" -H "Content-Type: application/json" -d '{"crewSize":8,"preferredStart":"2026-11-26T17:21:49Z"}'
curl -s -w "HTTP %{http_code}\n" -X DELETE -H "X-API-Key: $KEY" http://localhost:3000/api/bookings/bkg_6008
```

The first answers the booking with its `status`, the second the booking with `"crewSize":8`, and the third `HTTP 204` with no body (afterwards the booking answers `404`). Changing or cancelling a booking that staff already decided answers `409`:

```json
{"message":"Booking bkg_6008 is confirmed; only pending bookings can be changed"}
```

**Staff confirm or decline a booking** (Endpoint 24): log in as staff of the course's centre, then

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"wanjiru.njeri@example.com","password":"ujuzi-demo-pass"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X PATCH http://localhost:3000/api/bookings/bkg_6008 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"status":"confirmed"}'
```

```json
{"id":"bkg_6008","courseId":"crs_501","eventName":"Wanjiku and Otieno wedding","crewSize":8,"preferredStart":"2026-11-26T17:21:49Z","status":"confirmed","createdAt":"2026-10-27T17:21:49Z"}
```

**Log in** (Endpoint 9)

```bash
curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"achieng.otieno@example.com","password":"ujuzi-demo-pass"}'
```

```json
{"token":"6b98f462…(64 characters)","expiresAt":"2026-11-03T17:21:49Z","user":{"id":"grd_0101","role":"graduate","email":"achieng.otieno@example.com","firstName":"Achieng","lastName":"Otieno","centreId":null}}
```

Other website endpoints: register (8), logout (10), me (11), enrol (12), my enrolments (13); staff create or replace a course (20, 21), issue a certificate (22), list the centre's bookings (23). They are all in `/docs`.

**Jobs that match a course, read live from Kazi Connect** (Endpoint 14)

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/courses/crs_501/job-matches
```

```json
[{"jobId":"job_12348","title":"Cafeteria Server","category":"catering","county":"Nairobi","area":"Westlands","duration":"Lunch hours","urgent":true,"payRange":{"minKes":10000,"maxKes":14000}}]
```

(The reply is the list of matching jobs, here shortened to the first.) The county defaults to the course's own; add `?county=Kiambu` to look elsewhere. Answers can be up to 5 minutes old.

**Apply for a job, follow it, change it, withdraw it** (Endpoints 15 to 19)

```bash
curl -s -i -X POST http://localhost:3000/api/me/applications -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jobId":"job_12348","preferredDate":"2026-12-06T17:22:05Z","note":"Available after 2pm"}'
```

```text
HTTP/1.1 201 Created
location: /api/me/applications/app_1037
```

```json
{"applicationId":"app_1037","jobId":"job_12348","preferredDate":"2026-12-06T17:22:05Z","note":"Available after 2pm","status":"pending","createdAt":"2026-10-27T17:22:05Z"}
```

`GET /api/me/applications` lists them, `PUT /api/me/applications/app_1037` (body `{"preferredDate": ...}`) reschedules a pending one, and `DELETE /api/me/applications/app_1037` answers `204` and keeps it in your list as `cancelled`. Only your Ujuzi graduate id is ever sent to Kazi, never your name, email or phone.

**Live status** (Endpoint 19) is a WebSocket at `/api/me/applications/feed`. Connect, then send `{"type":"auth","token":"YOUR_TOKEN"}` within 5 seconds. The server answers `{"type":"ready"}` and then sends `{"applicationId":"app_1037","status":"accepted","updatedAt":"2026-10-27T17:30:00Z"}` for every change to one of your applications. A missing or bad token closes the socket with code `4401`. Swagger UI cannot open WebSockets.

## Error reference

Every failure answers with one field, `message`, in plain English, and nothing is changed:

```json
{ "message": "Course crs_999 not found" }
```

| Code | Meaning | Example cause |
|---|---|---|
| 400 | The request is wrong | Missing field, wrong type, unknown field, a date in the past, 30 February, a malformed certificate number |
| 401 | No valid key or token | Missing `X-API-Key`, a wrong key, or an expired login |
| 403 | Not allowed | Staff deciding another centre's booking; a graduate calling a staff endpoint; staff sign-up when no invite code is set |
| 404 | No such id | A mistyped id, a cancelled booking, someone else's application |
| 409 | Not allowed in the current state | Changing or cancelling a confirmed booking; a second pending booking for the same event; enrolling twice |
| 413 | Body too large | More than 20 KB of JSON |
| 426 | Upgrade Required | Plain HTTP to the WebSocket endpoint |
| 502 | Kazi Connect could not be reached | Kazi asleep or down; Ujuzi's other endpoints keep working. Try again in a minute |

The order of checks on every write is: login (401), the body (400, 413), the thing it names (404), ownership (403), then state (409).

## Run the API on your own computer

You need Node.js 20.9 or newer (Next.js requires it) and Git.

```text
git clone TODO-repo-url
cd ujuzi-webapp
npm install
npm run build
npm start
```

Open http://localhost:3000 for the website or http://localhost:3000/docs for the docs. With no settings, data is kept in memory and reset to sample data on every restart, so no database is needed. Partner calls need `PARTNER_KEYS` (see Authentication).

To use PostgreSQL instead, set `DATABASE_URL`. The server then applies its own migrations when it starts, and with `SEED_ON_START=true` fills an *empty* database with the sample data (`npm run db:migrate` and `npm run db:seed` do the same by hand).

To check everything works:

```text
npm run typecheck
npm test
npm run verify
```

`npm run verify` starts the app, sends every case in `scripts/verifyCases.ts` and compares each real answer with `openapi.yaml` field by field, then writes `VERIFICATION.md`. Other scripts: `npm run test:partner` (our tests of Kazi Connect, `KAZI_URL=http://localhost:4002 npm run test:partner`), `npm run ring:check` (one end-to-end look at Kazi and Ujuzi; needs `UJUZI_API_KEY`), `npm run key:issue`, `npm run types`.

Settings (environment variables, see `.env.example`): `PORT` (default 3000), `DATABASE_URL`, `PARTNER_KEYS` (hashes of the keys we accept), `SESSION_SECRET` (set a long random value outside local runs), `KAZI_API_URL` and `KAZI_WS_URL` (our upstream), `STAFF_INVITE_CODE` (opens staff sign-up; closed when unset), `SEED_ON_START` and `SEED_PASSWORD` (demo data only: anyone who can reach a seeded deployment can log in as the sample staff with the default password, so set `SEED_PASSWORD`).

## More documents

`TEAM_CHARTER.md`, `API_NEEDS.md`, `ENDPOINT_LIST.md`, `openapi.yaml`, `CONTRACT_QUESTIONS.md`, `CONTRACT_DEVIATIONS.md`, `VERIFICATION.md`, `PARTNER_TEST_RESULTS.md`, `PAUSED_ERRORS.md`, `BLIND_TEST_REPORT.md`.
