# Security audit: Ujuzi API (Week 9)

Done on 2026-10-27 against contract version 0.3.0, and the follow-up fixes of 2026-10-28 (version 0.4.0) added at the end of each section, on the in-memory sample data on a local machine, with the same build `npm start` serves. Nothing here was run against a deployment: none exists yet. Every check below is a command that can be run again: `npm run security:probe` (the attacks in sections 1 to 5, 58 checks), `npm run verify` (196 cases against the contract) and `npm test`. The real terminal output for the key and rate-limit checks is in `evidence/week09/`.

## What was added this week

| Part | What | Where |
|---|---|---|
| A. Keys on every endpoint | A call with no key, or a wrong key, is `401 { "message" }` before anything else (even before the body is read). Partner endpoints take `X-API-Key`; the website's endpoints take a login token. The only open endpoints are register and login (nobody has a token before them) and the website's pages. | `lib/auth/guards.ts`, `lib/auth/partnerKey.ts` |
| A. One key per consumer, outside the source | Keys are made with `npm run key:issue -- <name>` and shown once. Only the SHA-256 hash is stored, in the `PARTNER_KEYS` environment variable (Render's settings). Two keys are accepted now and tested; withdrawing one is deleting its hash. | `.env.example`, `render.yaml` |
| B. Rate limiting | 100 requests a minute per partner key, 120 a minute per client address for everything else, 10 a minute per address on login and register. Over the limit: `429`, a `Retry-After` header and `{ "message" }`, and the request is not carried out. | `lib/rateLimit.ts`, `proxy.ts` |
| C. Documentation | README (authentication, rate limits, 401 and 429 examples with `<your-api-key>`), `openapi.yaml` 0.3.0 (`429` on all 24 operations), `CONTRACT_DEVIATIONS.md` entry. | |
| 0.4.0. Partner keys have names | `PARTNER_KEYS` entries are `name:hash`. A booking is filed under the name of the key that made it; another key gets 404 for it on read, change and cancel, and the duplicate-booking rule is per partner. | `lib/auth/partnerKey.ts`, `lib/db/migrations/003_*.sql` |
| 0.4.0. Sign-in lockout | Five wrong passwords in a row for one email lock it for 15 minutes (429, `Retry-After`). Kept in the database, and an email with no account is locked the same way. | `lib/auth/lockout.ts`, table `sign_in_failures` |
| 0.4.0. Change password | `POST /api/auth/password` (Endpoint 25): needs the current password, ends the user's other logins, shares the lock. | `app/api/auth/password/route.ts` |
| 0.4.0. Proxy hops | `TRUST_PROXY_HOPS` says how many proxies are in front; `LOG_CLIENT_ADDRESS=true` prints how the address was worked out, to find the number on a new host. | `lib/rateLimit.ts` |
| Extra | Security headers on every answer; `Cache-Control: no-store` on every API answer. | `next.config.ts` |

### Why these thresholds

- **Partner key, 100 a minute.** Sherehe's real use is a few calls per event (read courses, create a booking, poll its status). 100 a minute is far above that for a person or a normal client, and far below what a runaway loop does, so a bug in a partner's code is stopped within a minute and cannot slow the other partner (each key has its own bucket). This is a judgement, not a measurement: Sherehe has not told us its real call rate. If they need more, the number is one environment variable.
- **Anyone else, 120 a minute per address.** A page load of the website makes a handful of calls, so one person never gets near it. It is higher than the sign-in limit because a classroom or an office can sit behind one address.
- **Sign-in, 10 a minute per address.** A person mistypes a password a few times; a guessing program makes thousands. Ten a minute keeps a real user comfortable and holds a guesser to about 14,000 tries a day per address.
- **Wrong keys count against the address.** Otherwise a key could be guessed without ever being counted.

### What the rate limit does not do (honest limits)

- The request counters are in the server's memory: a restart clears them, and two copies of the server would each count separately. One copy on Render is fine, and they are a safety net against loops, not what protects secrets. **What protects secrets does not reset:** the sign-in lockout (below) is in the database. Scaling out would need a shared counter (Redis or the database) for the request limits.
- The request limits are per address. Many addresses together (a botnet) are not slowed by them; the lockout is per email, so many addresses guessing at one account still hit it after five tries. The cost of a per-email lock is that someone can lock a known email out for 15 minutes by typing wrong passwords; that is a nuisance, not a breach, and was chosen over letting guessing run.
- Behind Render's proxy the address comes from `X-Forwarded-For`. Render's documentation does not say clearly how many proxies are in the chain (community reports disagree), so the code does **not guess**: `TRUST_PROXY_HOPS` is the number of entries to count from the right, and `LOG_CLIENT_ADDRESS=true` prints what each request looked like so the number can be read off on the first deployment with two different networks. Until that is done on Render, assume nothing: if the number is wrong, all visitors can share one bucket. (`PAUSED_ERRORS.md`.)
- Sent `X-Forwarded-For` values are ignored unless `TRUST_PROXY=true`, and the server overwrites the internal peer header itself on every request, so a caller cannot pick its own bucket by sending headers (tested).

## The self-audit (Part D)

Method: read the code for each point, then attack a running copy with `npm run security:probe` and the test suite, then fix what turned up and run everything again.

### 1. Sensitive fields: does any answer carry something it should not?

Checked every kind of answer (courses, certificate check, booking, `GET /api/me`, enrolments, the staff booking list, login, register) for password hashes, token hashes, secrets and database column names.

- **Found: nothing.** The mappers in `lib/mappers.ts` build each answer field by field from the contract's shape rather than passing a database row through, so a column added to a table later does not leak. `GET /api/me` returns exactly its six contract fields.
- Certificate check: `holder` is a first name and one initial ("Achieng O."); no surname, email, id number or phone appears in any partner answer (the probe checks that no partner answer contains an `@`).
- Passwords are stored as scrypt hashes; login tokens only as an HMAC of the token; partner keys only as SHA-256. None of those columns is selected into an answer.
- **Left as is, noted:** the register endpoint answers `409` for an email that already has an account, which tells a stranger that the email is registered. A fix would stop people from finding out why signing up fails, so it is kept (recorded in `CONTRACT_DEVIATIONS.md`).

### 2. Other people's data: can changing an id reach a record that is not yours?

Tried, with sample accounts: a graduate listing or withdrawing another graduate's application, staff of one centre deciding a booking, editing a course or issuing a certificate at another centre, a graduate calling staff endpoints and the reverse, a login token on partner endpoints and a partner key on staff or graduate endpoints.

- **Found: nothing reachable.** Each is refused (403, or 404 for "someone else's application", which does not confirm it exists), and a graduate's lists are built from the logged-in user's id, not from anything in the request. Staff booking lists contain only their own centre.
- **Found, then fixed (0.4.0):** a partner key could read, change or cancel **any** booking by id, not only the bookings its holder made. Harmless with one partner, but a second partner's key would have reached the first's. Now each booking carries the name of the key that made it (`partner` column, filled from `PARTNER_KEYS`); another key gets 404 on GET, PUT and DELETE, nothing changes, and a booking made with one key is invisible to the other. Staff of the centre still see and decide every booking for their courses, whichever partner made it. Tests: `__tests__/partnerKeys.test.ts`, `__tests__/store.test.ts`, `npm run verify`, and the probe with two keys.

### 3. Error messages: do failures reveal how the server is built?

Sent: SQL in an id and in a query value, broken percent-encoding, a null byte, a 5,000-character id, JSON that is not JSON, JSON nested 9,000 levels, a number too big for JSON, a 30 KB body, a method a route does not have, unknown and `..` paths, a malformed bearer token, markup in a job id. Looked in every answer for stack traces, file paths, SQL, library names and environment variable names, and checked for `X-Powered-By` or a server version.

- **Found 1: broken percent-encoding gave a bare 500 in plain text** (`GET /api/courses/%E0%A4%A`, with or without a key). It revealed nothing, but it was a server error caused by the caller, answered outside our `{ "message" }` format. **Fixed:** `server.ts` answers `400 { "message": "The URL is not valid." }` before the request reaches Next. Test: `__tests__/server.test.ts`.
- **Found 2: `jobId` accepted any text up to 64 characters** and passed it on inside a URL to Kazi, so `../applications` or markup reached another system's URL. Nothing came back to the caller, but our server was a way to send odd paths to Kazi. **Fixed:** `lib/validation.ts` allows only letters, digits, `_` and `-`; anything else is the usual 400 and Kazi is not asked. Test: `__tests__/kaziApplications.test.ts`.
- **Found 3, then fixed (0.4.0): a method a route does not have answered `405` with an empty body** (Next's own answer), the one error that was not `{ "message" }`. `server.ts` now gives such an answer on `/api` the body `{ "message": "This URL does not accept that method" }`. Test: `__tests__/lockout.test.ts`.
- Everything else (SQL text, null byte, long id, bad JSON, deep JSON, huge number, 30 KB) answered with a plain 400, 404 or 413 and no detail. Unexpected failures are logged on the server and answered `{ "message": "Internal server error" }`; the log line is the error object, not the request, so no key or password is printed.
- Not shown anywhere in answers: `X-Powered-By` is off (`poweredByHeader: false`); API answers carry `Cache-Control: no-store` so another user's data is not kept by a shared cache.

### 3b. Password guessing: is it slowed, and does the lock say who has an account? (0.4.0)

Before: only the per-address sign-in limit (10 a minute), which an attacker with several addresses gets round, and no way for a user to change a password.
- **Fixed:** five wrong passwords in a row for one email lock it for 15 minutes; login answers 429 with `Retry-After`, even for the right password, and a wrong "current password" on the password change counts towards the same lock (so a stolen login token cannot be used to guess the password). The probe shows `401 x5, 429, 429` for a real account **and** for an email with no account, with the identical message, so the lock does not reveal which emails are registered. The lock is in PostgreSQL (`sign_in_failures`), so a restart or a second server does not reset it; counting is one `INSERT ... ON CONFLICT`, so simultaneous guesses are all counted (tested on real PostgreSQL). A successful sign-in clears the count.
- **Password change:** `POST /api/auth/password` ends every other login of that user and keeps the one that asked.
- **Still not built:** "forgot my password" by email. It needs an email service (a provider and its key) and a decision on wording and expiry; nothing safe can be sent without one, and a reset link written to a log would be worse than none.

### 4. Write endpoints: can a caller send an extra field and have it saved?

Tried to set fields the caller must not control: `status` and `id` on a booking, `centreId` on a new course (choosing another centre), `studentId` on an application (acting as another graduate), `id` and `isAdmin` on register, a `__proto__` key in a JSON body, and a staff sign-up without the invite code.

- **Found: nothing saved.** Every write endpoint checks the body against a list of allowed fields first, and an unknown field is a 400 (`Unknown field(s): ...`) with nothing written. The `__proto__` attempt is refused the same way and a later request showed no change. Staff sign-up without the invite code is 403, and with no code configured it is closed.
- The fields that must come from the server come from the server: the centre of a new course is the staff member's own, the graduate on an application is the logged-in graduate, a new booking is always `pending`.

### 5. Keys in the wrong place?

- **Git history, all branches:** searched every commit for strings shaped like a partner key (`ujz_...`), a GitHub token (`gho_`, `ghp_`), a database URL with a password, or a private key: **none**. `.env` has never been committed, and `.gitignore` excludes `.env` and `.env.*` except `.env.example`. The only tracked env-like file is `.env.example`, which holds empty or placeholder values.
- **Working tree:** the only `ujz_...` strings are the two fake keys the test suite and the verify script use. They are not accepted by any deployment because only hashes of real keys are ever configured.
- **README, `openapi.yaml`, `evidence/week09/`:** show `<your-api-key>` or `YOUR_KEY`; the evidence file was checked for the real key's text and has none.
- **Server log:** prints only a count (`Partner keys loaded: 1`); the run's log contained neither the key nor an `Authorization` header.
- **In a URL:** the key is read only from the `X-API-Key` header; a key in a query string is ignored (it would be kept in server and proxy logs). Rate-limit buckets use a shortened hash of the key, never the key.
- **Not checked:** Render's own settings and logs (nothing is deployed); the other teams' repositories (not ours to read).

## Tests added or extended this week

- `__tests__/rateLimit.test.ts`: the limiter on its own; over HTTP, a partner key's fourth call with a limit of 3 is a 429 with `Retry-After`, the JSON body and CORS headers; keys are counted separately; a wrong key counts against the address and a valid key is not affected by someone else's wrong ones; login and register share a sign-in bucket; the window resets; `OPTIONS` is exempt; `TRUST_PROXY` behaviour.
- `__tests__/partnerKeys.test.ts` (kept from the key work): 401 without a key with the `{ message }` body, 401 for wrong keys, 200 with either issued key, 401 before the body is read, nothing created or changed on an unauthorised write, a key withdrawn at once when its hash is removed.
- `__tests__/server.test.ts`: security headers and `no-store`; broken percent-encoding is a 400.
- `__tests__/lockout.test.ts`: the lock (real account and no account the same; case and spaces ignored; success clears the count; ends by itself; kept in the store; a bad body counts for nothing), the password change (401, 400s, 403 counted towards the lock, 204, old password dead and new one works, other logins end, staff too), and the JSON 405.
- `__tests__/store.test.ts`: on MemoryStore **and on a real PostgreSQL** (`TEST_DATABASE_URL`): partner ownership, passwords and sessions, and the failure counter including simultaneous failures.
- `__tests__/partnerKeys.test.ts`: named keys, and one key cannot reach another's bookings.
- `__tests__/kaziApplications.test.ts`: a `jobId` with markup or path characters is a 400 and Kazi is not asked.
- `npm run verify` has new cases for the 429 (including that a refused `POST /api/bookings` creates nothing) and for the sign-in limit.
- **Mutation check:** with the limiter changed to allow everything, the percent-encoding guard removed and the `jobId` check removed, 19 of the 89 tests in those three files failed; with the code restored they pass.

## Results after the fixes

| Check | Result |
|---|---|
| `npm run security:probe` | 58 checks OK, 0 findings, 0 notes (on 2026-10-27, 2 findings before the first two fixes; on 2026-10-28 the two notes became fixes) |
| `npm run typecheck` | clean |
| `npm test` | 23 suites, 687 tests passed, none skipped (PostgreSQL parity tests run against a scratch database on the local ring's PostgreSQL) |
| `npm run verify` | 25 of 25 operations, 196 cases, OK |

## Still open

1. **`TRUST_PROXY_HOPS` is unchecked on Render.** The method to find it is built (`LOG_CLIENT_ADDRESS`); it needs one real deployment and two networks. Until then, a wrong number can put every visitor in one request bucket.
2. **No "forgot my password" by email**: needs an email service. Signed-in users can change their password; a locked-out user waits 15 minutes.
3. **Request limits are per server copy** and reset on restart (the lockout is not). Fine for one copy; a shared counter is needed to run several.
4. **The seeded demo accounts share a public password**; any deployment that seeds must set `SEED_PASSWORD`.
5. **Nothing was tested on a live deployment.**
6. Registering with an email that exists answers `409`, which says the email has an account (kept on purpose, rate limited; agreed with the Sherehe agent as the sensible choice until email verification exists).
