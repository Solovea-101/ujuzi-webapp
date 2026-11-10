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

- **Partner systems** (Sherehe) send `X-API-Key: YOUR_KEY` on every partner call (Endpoints 1 to 7). Only a SHA-256 hash of each key is stored, in `PARTNER_KEYS` (Render's settings, never git), as `name:hash` entries such as `sherehe:<hash>`; the name says whose key it is. Make a key and its entry with `npm run key:issue -- sherehe`; give the partner the key once, put the entry in `PARTNER_KEYS`. **A booking belongs to the partner whose key made it:** another partner's key gets `404` for it, the same answer as for a booking that does not exist. With no key configured every partner call is a 401. TODO: how a tester gets a demo key for the live deployment.
- **Graduates and staff** on the website log in with `POST /api/auth/login` and then send `Authorization: Bearer YOUR_TOKEN`. A token is valid for 7 days and stops working at once on `POST /api/auth/logout`.
- **Every endpoint needs one or the other**, except `POST /api/auth/register` and `POST /api/auth/login` (you have no token before them) and the website's pages and `openapi.yaml`. No key or token is a `401`; a wrong key is the same `401`, with the same words, so a guesser learns nothing. Keys are never in the code or the repository: they live in the environment (`PARTNER_KEYS`, hashes only), one key per consuming system, so one partner's key can be withdrawn without touching another's.
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

## Rate limits

Each partner key may make **100 requests a minute** (its own bucket, so one partner's loop cannot slow another). Everything without a valid key (the website, someone guessing keys) is counted **per client address, 120 a minute**, and sign-in (`POST /api/auth/login` and `/register`) is **10 a minute per address** so passwords cannot be guessed at speed. Over the limit the answer is `429` with a `Retry-After` header (seconds) and the usual body, and the request is not carried out:

```
$ curl -si https://YOUR-UJUZI-URL/api/courses -H "X-API-Key: <your-api-key>"
HTTP/1.1 429 Too Many Requests
retry-after: 60
content-type: application/json

{"message":"Too many requests. Try again in 60 seconds."}
```

Wait that long, then carry on. The counters live in the server's memory, so a restart clears them and two servers would each count on their own; behind a proxy set `TRUST_PROXY=true` and `TRUST_PROXY_HOPS` (see `.env.example`, which also says how to find the right number on a new host).

**Sign-in lockout.** Five wrong passwords in a row for one email address lock that address for 15 minutes: `POST /api/auth/login` answers `429` with `Retry-After`, even for the right password. The lock is kept in the database, so a restart does not clear it, and an email with no account is locked in the same way, so the answer never says who is registered. A good sign-in clears the count.

**Changing a password.** `POST /api/auth/password` with `{"currentPassword": "...", "newPassword": "..."}` (8 to 128 characters, different from the old one) and your token answers `204`. Every other login of yours ends at once; the one that asked keeps working. A wrong current password is `403` and counts towards the same lock. Email-based "forgot my password" is not built: it needs an email service. `evidence/week09/` has a real run showing `200 200 200 429 429`.

A missing or wrong key looks like this (the key is never echoed back):

```
$ curl -si https://YOUR-UJUZI-URL/api/courses
HTTP/1.1 401 Unauthorized

{"message":"Send your partner key as X-API-Key, or log in and send Authorization: Bearer YOUR_TOKEN"}
```

## When Kazi Connect is slow or down

Ujuzi reads live jobs from Kazi Connect (`GET /api/courses/{courseId}/job-matches`) and Kazi runs on a free server that sleeps. A slow or failing Kazi never takes Ujuzi down: courses, certificates and bookings do not call Kazi at all.

| Situation | What the person sees | What Ujuzi did |
|---|---|---|
| Kazi answers | The live jobs | One request |
| Kazi fails now and then (a 500, 502, 503 or 504, a dropped connection, a slow moment) | The live jobs, a little late | Up to **2 retries**, after 200 ms and then 400 ms, inside one 10 second budget; each attempt gets at most 3 seconds |
| Kazi is down or too slow, and this question was answered earlier (up to an hour ago) | The **saved jobs**, with the banner "Showing saved jobs from 14:05. Kazi Connect is not responding" | The last good list, kept in memory: the answer is still `200` and a bare array, with the headers `X-Data-Stale: true` and `X-Data-As-Of: 2026-11-04T09:12:21Z` |
| Kazi is down and nothing is saved (first look, or after a restart) | "Kazi Connect could not be reached. Try again in a minute." | `502 { "message": "..." }` |
| Kazi asks us to slow down (`429`) | As above | A `Retry-After` of up to 5 seconds is waited for; a longer one is not (the person would be left waiting) |

Never retried: a `400`, `401`, `403`, `404` or `409` (asking again changes nothing) and anything that writes (apply, change, withdraw: a retry might do it twice). The saved copy is in this server's memory only, so a restart clears it. Every failure is logged with its cause, for example `kazi GET /api/jobs failed: ECONNREFUSED` (nothing is listening), `ENOTFOUND` (the address is wrong), `timeout` or `HTTP 503`, and the log never holds the key, a query or a body. The numbers, how they were chosen and what was measured are in `RESILIENCE_NOTES.md`; to watch it happen, run the stand-in partner (`npm run partner:flaky`, modes `ok`, `slow`, `flaky`, `error`, switched with `curl http://localhost:4000/__mode/slow`) and start Ujuzi with `KAZI_API_URL=http://localhost:4000`.

## Monitoring: the request log and `GET /api/stats`

**The log.** Every request to `/api` is printed as one line of JSON when its answer has been sent, so a rejected request (401, 429, a broken URL) is in it too:

```
{"time":"2026-11-05T14:20:22.630Z","method":"GET","path":"/api/courses","status":200,"ms":41,"caller":"key-55dc13","partner":"labs"}
{"time":"2026-11-04T09:09:22.601Z","method":"GET","path":"/api/courses","status":401,"ms":1.9,"caller":"bad-key"}
```

`caller` is `key-xxxxxx` (six characters of the hash of a valid partner key, with the partner's name from `PARTNER_KEYS`), `bad-key`, `login` (a website token was sent) or `none`. The log never holds a key, a token, a password, a query string or a body. To keep it in a file: `npm start | tee requests.log` (`*.log` is ignored by git); `LOG_REQUESTS=false` turns it off.

**The numbers.** `GET /api/stats` needs a partner key like the rest of the partner API (no key is a `401`) and answers the running totals since the server started. It is Endpoint 26 of `openapi.yaml` (contract 0.5.0; see `CONTRACT_DEVIATIONS.md`).

```bash
curl -s -H "X-API-Key: <your-api-key>" http://localhost:3000/api/stats
```

```json
{
  "startedAt": "2026-11-05T14:20:22Z",
  "uptimeSeconds": 634,
  "total": 183,
  "clientErrors": 67,
  "serverErrors": 0,
  "errorRatePercent": 0,
  "avgMs": 10.3,
  "statuses": { "200": 116, "400": 15, "401": 18, "404": 34 },
  "callers": { "key-3b265a": 106, "key-55dc13": 59, "none": 18 },
  "routes": {
    "GET /api/courses/{courseId}": { "count": 44, "clientErrors": 15, "serverErrors": 0, "avgMs": 17.8, "maxMs": 619.7 }
  },
  "kazi": { "calls": 0, "failures": 0, "retries": 0, "rateLimited": 0, "staleServed": 0, "failuresByReason": {} }
}
```

(A real reply, shortened to one route; the full one is in `evidence/labs/stats-4013-2026-11-05.json`.) `clientErrors` are 4xx (usually the caller's mistake) and `serverErrors` are 5xx (ours): the error rate counts only 5xx. Routes are patterns, so `/api/courses/crs_501` and `/api/courses/crs_9999` are one row. `kazi` is the state of our link to Kazi Connect: how many calls, failures (by cause), retries, 429s and saved copies served. The numbers are in memory: they restart from zero with the server and are not shared between copies. `npm run traffic` sends a mix of requests to give them something to show.

## Error reference

Every failure answers with one field, `message`, in plain English, and nothing is changed:

```json
{ "message": "Course crs_999 not found" }
```

| Code | Meaning | Example cause |
|---|---|---|
| 400 | The request is wrong | Missing field, wrong type, unknown field, a date in the past, 30 February, a malformed certificate number or URL |
| 401 | No valid key or token | Missing `X-API-Key`, a wrong key, or an expired login |
| 403 | Not allowed | Staff deciding another centre's booking; a graduate calling a staff endpoint; staff sign-up when no invite code is set; a wrong current password when changing it |
| 404 | No such id | A mistyped id, a cancelled booking, someone else's application |
| 409 | Not allowed in the current state | Changing or cancelling a confirmed booking; a second pending booking for the same event; enrolling twice; applying for a Kazi job that is closed or already filled |
| 405 | The URL does not accept that method | `PUT /api/courses` |
| 413 | Body too large | More than 20 KB of JSON |
| 429 | Too many requests | Over the rate limit above, or an email locked after five wrong passwords; read `Retry-After` and wait |
| 426 | Upgrade Required | Plain HTTP to the WebSocket endpoint |
| 502 | Kazi Connect could not be reached | Kazi asleep, down or too slow, and no saved copy to show; Ujuzi's other endpoints keep working. Try again in a minute |

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

`npm run verify` starts the app, sends every case in `scripts/verifyCases.ts` and compares each real answer with `openapi.yaml` field by field, then writes `VERIFICATION.md`. Other scripts: `npm run test:partner` (our tests of Kazi Connect, `KAZI_URL=http://localhost:4002 npm run test:partner`), `npm run ring:check` (one end-to-end look at Kazi and Ujuzi; needs `UJUZI_API_KEY`), `npm run security:probe` (the Week 9 attacks against a running copy; see `SECURITY_AUDIT.md`), `npm run key:issue`, `npm run types`, `npm run partner:flaky` (a stand-in Kazi that you can make slow or flaky) and `npm run traffic` (a mix of requests to give the logs something to show).

Settings (environment variables, see `.env.example`): `PORT` (default 3000), `DATABASE_URL`, `PARTNER_KEYS` (`name:hash` of the keys we accept), `SESSION_SECRET` (set a long random value outside local runs), `KAZI_API_URL` and `KAZI_WS_URL` (our upstream), `KAZI_API_KEY` (only when Kazi has API keys switched on; sent as `X-API-Key` on every call to Kazi and on its WebSocket; a 401 from Kazi is logged once as a key problem and answered with our own 502, a 429 is waited out), `STAFF_INVITE_CODE` (opens staff sign-up; closed when unset), `RATE_LIMIT_PARTNER`, `RATE_LIMIT_ANON`, `RATE_LIMIT_LOGIN`, `RATE_LIMIT_WINDOW_MS`, `TRUST_PROXY`, `TRUST_PROXY_HOPS` and `LOG_CLIENT_ADDRESS` (rate limiting, see above), `LOCKOUT_MAX_FAILURES`, `LOCKOUT_WINDOW_MINUTES` and `LOCKOUT_MINUTES` (sign-in lockout), `SEED_ON_START` and `SEED_PASSWORD` (demo data only: anyone who can reach a seeded deployment can log in as the sample staff with the default password, so set `SEED_PASSWORD`).

## More documents

`TEAM_CHARTER.md`, `API_NEEDS.md`, `ENDPOINT_LIST.md`, `openapi.yaml`, `CONTRACT_QUESTIONS.md`, `CONTRACT_DEVIATIONS.md`, `VERIFICATION.md`, `PARTNER_TEST_RESULTS.md`, `PAUSED_ERRORS.md`, `SECURITY_AUDIT.md`, `BLIND_TEST_REPORT.md`, and for Weeks 10 to 12: `INTEGRATION_LOG.md` (every bug and surprise at the seam with our partners), `RESILIENCE_NOTES.md` (timeout, retries, saved data) and `MONITORING_NOTES.md` (logs and `/api/stats`).
