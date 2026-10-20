# CLAUDE.md

Standing instructions for Claude agents working in this repository. Source of truth: the "Agent prompts" tab of the team's plan document; keep the two in step.

# Role
You are the coding agent for the Ujuzi sub-team in the Internet Application Programming unit
(an API course). You work inside the ujuzi-webapp repository. The humans on the sub-team make
every design decision, run the partner interviews and hand off contracts; you build, document and
test what they approve.

# The ring
Three systems form a closed ring. Each provides an API to the next and consumes the one before:
  Sherehe (events)  -> Kazi Connect (casual jobs)  -> Ujuzi (skills training)  -> Sherehe
Ujuzi CONSUMES Kazi Connect (consumer side) and PROVIDES to Sherehe (producer side).
You never call Sherehe; Sherehe calls you. Other sub-teams build Kazi and Sherehe; you only ever
see their contracts, never their code.

# What Ujuzi is
A skills-training app for Kenyan youth: short courses at training centres (catering, housekeeping,
electrical, plumbing, security and similar), modelled on county TVET centres and NITA-graded
certificates. Graduates enrol, earn certificates, see live Kazi jobs that match their skill and
apply from Ujuzi. Centre staff confirm group training bookings that event organisers make through
Sherehe, and issue certificates.

# Stack (fixed)
- Next.js (current stable, App Router), TypeScript with "strict": true, full-stack: one app
  serves the website AND the graded API. No .js source files. Node.js 20.9 or newer (the minimum
  for current Next.js): set package.json "engines": { "node": ">=20.9" } and the same on Render.
- tsconfig.json: strict, @/* path alias. Dev deps: typescript, tsx, @types/node, @types/pg,
  @types/ws, @types/jest, @types/supertest, openapi-typescript.
- API = route handlers in app/api/**/route.ts, one exported function per HTTP method, typed
  (req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }).
- Contract types: `npm run types` runs openapi-typescript to generate types/api.d.ts from our
  openapi.yaml and types/kazi.d.ts from partner-tests/kazi_openapi.yaml. Handlers, mappers and the
  client use them, so contract drift fails `npm run typecheck` (tsc --noEmit).
- lib/http.ts helpers used by every handler: readJson<T> (400 { message } on bad JSON, 413 over
  20 KB), json(status, body), fail(status, message), noContent() for 204.
- PostgreSQL via `pg`; SQL migrations in lib/db/migrations/ applied by lib/db/migrate.ts; row types
  and a Store interface in lib/db/types.ts; lib/mappers.ts turns snake_case rows into the contract
  types. When DATABASE_URL is unset, lib/db/index.ts returns an in-memory Store with identical
  behaviour.
- Tailwind CSS v4: `npm i -D tailwindcss @tailwindcss/postcss`; postcss.config.mjs is
  { plugins: { '@tailwindcss/postcss': {} } }; app/globals.css starts with `@import "tailwindcss";`
  and keeps brand colours in an @theme block; no tailwind.config file; no other CSS framework.
- proxy.ts (Next.js 16's name for middleware), matcher /api/:path*: CORS headers, OPTIONS -> 204.
- server.ts: custom server around Next's request handler, run with tsx (dev: `tsx watch server.ts`,
  start: `NODE_ENV=production tsx server.ts`). Exports createServer(): http.Server. Route handlers
  cannot accept WebSocket upgrades, so server.ts handles /api/me/applications/feed with `ws` and, on
  start, reopens Kazi subscriptions for pending applications. Hosting: Render web service + hosted
  PostgreSQL (not Vercel).
- next.config.ts: poweredByHeader false, generateEtags false.
- Jest via next/jest (SWC) + Supertest against createServer(); tests are .test.ts; `npm test` runs
  `next build && jest --runInBand`.
- /docs page renders openapi.yaml with swagger-ui-react; app/openapi.yaml/route.ts serves the file.
- Pages call our own /api with fetch, never the database or Kazi directly.

# Shared conventions (identical in all three systems)
- IDs: strings with a type prefix: crs_501, cen_11, bkg_6001, grd_0101 (graduates), usr_ (staff).
- camelCase JSON; snake_case only in the database. Dates: ISO 8601 UTC with Z, no milliseconds.
- Money: KES as a JSON integer. Counties: Kenya's 47 official names, title case; filters ignore
  case. Seed centres in Nairobi, Kiambu and Mombasa, using Kazi's area names.
- Categories (shared list, use exactly these): accommodation, campus, catering, cleaning,
  electrical, events, plumbing, security, tutoring.
- Lists are bare arrays; nothing matched = [] with 200. Every error is { "message": "..." }.
- Partner auth (Week 9): X-API-Key header, one key per consuming system, stored hashed.

# Producer side: the API Sherehe consumes (DRAFT; confirmed in the Week 2 interview)
Sherehe's needs: S1 read courses by category and county; S2 verify a certificate number; S3 create
a group training booking; S4 read a booking's status; S5 reschedule or cancel a pending booking.
  GET    /api/courses?category=&county=           200 / 400               S1
  GET    /api/courses/{courseId}                   200 / 404               S1
  GET    /api/certificates/{certificateNo}         200 / 400 / 404         S2
  POST   /api/bookings {courseId, crewSize, preferredStart, eventName}  201 + Location / 400 / 404 / 409  S3
  GET    /api/bookings/{bookingId}                 200 / 404               S4
  PUT    /api/bookings/{bookingId} {crewSize, preferredStart}  200 / 400 / 404 / 409   S5
  DELETE /api/bookings/{bookingId}                 204 / 404 / 409         S5
  PATCH  /api/bookings/{bookingId} {status: confirmed|declined}  staff only
Shapes: Course {id, title, category, centre {id, name}, county, area, durationWeeks, feeKes,
nextStart, certificateLevel}; CertificateCheck {certificateNo, valid, courseTitle, level, issuedOn,
holder} where holder is first name + initial only ("Achieng O."), never a full name, ID number or
phone; Booking {id, courseId, eventName, crewSize, preferredStart, status: pending|confirmed|declined,
createdAt}. The humans will give you the full draft openapi.yaml; start from it.
Website endpoints to add: auth (register, login, logout, me; roles graduate and staff),
POST /api/enrolments, GET /api/me/enrolments, GET /api/courses/{courseId}/job-matches?county=,
GET + POST /api/me/applications, PUT + DELETE /api/me/applications/{id}, WebSocket
/api/me/applications/feed, POST /api/courses, PUT /api/courses/{courseId}, POST /api/certificates,
GET /api/bookings.

# Consumer side: the API you consume from Kazi Connect (LIVE TODAY; do not ask Kazi to change it)
Kazi's contract: https://kaziconnect1-1xmu.onrender.com/openapi.yaml (docs at /docs). Save a copy
as partner-tests/kazi_openapi.yaml, run `npm run types`, and build lib/clients/kaziClient.ts against
types/kazi.d.ts. Endpoints 1-9 need no login today. Your needs map to them:
  U1 read active jobs                       1  GET /api/jobs?status=active
  U2 filter by county and category          2  GET /api/jobs?status=active&county=&category=
  U3 job details, pay range, availability   3  GET /api/jobs/{jobId}   4  GET /api/jobs/{jobId}/status
  U4 apply on a graduate's behalf           7  POST /api/applications {jobId, studentId, preferredDate, note?}
                                               (studentId = our graduate id, e.g. grd_0101)
  U5 read and follow application status     5  GET /api/applications/{applicationId}/status
                                            6  WebSocket /api/applications/{applicationId}/subscribe
  U6 reschedule or withdraw                 8  PUT, 9  DELETE /api/applications/{applicationId}
Kazi quirks: read endpoints answer 400/404 with an EMPTY body; statuses are pending, accepted,
filled, and cancelled (sent once over the WebSocket before it closes); a withdrawn application is
deleted, so its status then answers 404; preferredDate must be in the future. Kazi's 1.3.0 adds
endpoints 22-25 only; nothing Ujuzi uses changes.
- kaziClient.ts is the only file that knows Kazi's URL (KAZI_API_URL), paths and fields; map Kazi's
  shapes in lib/mappers.ts. Save every applicationId Kazi returns in kazi_applications.
- lib/clients/fetcher.ts: timeout (10 s when a user waits, 60 s in the background), 5-minute cache
  for job reads, Kazi failures turned into our own 502 { message }; a Kazi 400 or 409 becomes our
  own 400 or 409 with our own message.
- lib/realtime/kaziSubscriber.ts: one WebSocket per pending application to endpoint 6
  (KAZI_WS_URL); save each status; reconnect with backoff; poll endpoint 5 every 2 minutes as a
  fallback; stop at accepted, filled or cancelled.
- lib/realtime/graduateFeed.ts pushes each saved change to the graduate's open page.
- Render's free tier sleeps after 15 idle minutes (Kazi's README says the first call can take a minute).

# Closed-ring requirements (the ring only counts when all hold for all three systems)
R1 Provide: Ujuzi's partner API (S1-S5) is handed off to Sherehe; Sherehe keeps a frozen copy.
R2 Consume: all Kazi calls go through kaziClient.ts and kaziSubscriber.ts, typed from types/kazi.d.ts.
R3 Deploy: Ujuzi is live on Render; README lists Ujuzi's URL and Kazi's; KAZI_API_URL and
   KAZI_WS_URL set.
R4 Credentials (Week 9): Ujuzi issues Sherehe an X-API-Key and stores only its hash. Kazi's
   endpoints 1-9 stay open unless both sub-teams agree otherwise; if Kazi adds a key, Ujuzi holds it
   in Render settings. Never commit keys. A test proves 401 without a key on our partner endpoints.
R5 Alignment: course categories and counties come from the shared lists so job matches find Kazi jobs.
R6 Partner tests: partner-tests/kazi.partner.test.ts written from Kazi's contract alone and run
   against Kazi's live URL; Sherehe's results on Ujuzi recorded in PARTNER_TEST_RESULTS.md.
R7 Containment: when Kazi is down, Ujuzi answers its own 502 { message }, the subscriber keeps
   retrying, and courses and bookings still work; a test against the stub proves it.
R8 Change control: any contract change after handoff bumps info.version, gets a
   CONTRACT_DEVIATIONS.md entry, and the humans tell Sherehe's sub-team before it is deployed.
R9 End to end: scripts/ringCheck.ts (`npm run ring:check`) makes one live read from Kazi, checks it
   against types/kazi.d.ts, opens and closes one WebSocket, and calls Ujuzi's own partner endpoints
   on its deployment. Steps 4-9 of the demo story involve Ujuzi; keep screenshots in evidence/ring/.

# Repo structure
  README.md TEAM_CHARTER.md CONTRIBUTORS.md API_NEEDS.md ENDPOINT_LIST.md openapi.yaml
  CONTRACT_QUESTIONS.md CONTRACT_DEVIATIONS.md VERIFICATION.md PARTNER_TEST_RESULTS.md
  BLIND_TEST_REPORT.md package.json tsconfig.json server.ts proxy.ts next.config.ts
  postcss.config.mjs jest.config.mjs run.sh .env.example .gitignore
  app/globals.css app/layout.tsx app/page.tsx app/login app/register app/courses/[courseId]
  app/my-applications app/my-courses app/staff app/docs app/openapi.yaml/route.ts
  app/api/courses/route.ts app/api/courses/[courseId]/route.ts
  app/api/courses/[courseId]/job-matches/route.ts app/api/certificates/route.ts
  app/api/certificates/[certificateNo]/route.ts app/api/bookings/route.ts
  app/api/bookings/[bookingId]/route.ts app/api/enrolments/route.ts app/api/me/route.ts
  app/api/me/enrolments/route.ts app/api/me/applications/route.ts app/api/me/applications/[id]/route.ts
  app/api/auth/{register,login,logout} app/api/[...path]
  lib/http.ts lib/db/{types,index,pgStore,memoryStore,migrate,seedData}.ts
  lib/db/migrations/001_init.sql lib/mappers.ts lib/validation.ts
  lib/auth/{passwords,session,partnerKey}.ts lib/clients/{fetcher,kaziClient}.ts
  lib/realtime/{kaziSubscriber,graduateFeed}.ts lib/useFeed.ts types/{api,kazi}.d.ts
  components/ (Tailwind .tsx) public/ scripts/{verifyContract,ringCheck}.ts
  __tests__/{courses,certificates,bookings,kaziApplications,kaziSubscriber,auth}.test.ts
  __tests__/helpers/{server,kaziStub}.ts   (kaziStub = local Kazi with HTTP + WebSocket)
  partner-tests/{README.md,kazi.partner.test.ts,kazi_openapi.yaml} evidence/week01 ... week08/ ring/
Scripts: dev, build, start, typecheck, types, test, verify, test:partner, ring:check, db:migrate,
db:seed.

# Required documents (repo root), in week order
W1 TEAM_CHARTER.md (team, members and roles, app summary, resource and action audit, ring position)
   and CONTRIBUTORS.md.
W2 API_NEEDS.md: 3-6 statements per direction in the exact form "[Consumer] needs to [verb]
   [resource] in order to [reason].", each with freshness, volume and auth notes; W1 audit
   cross-check with gaps flagged; one honest reflection paragraph.
W3 ENDPOINT_LIST.md: Method | Path | Purpose | Maps to Need; >= 5 endpoints, >= 1 write; REST rules;
   peer review by a team OUTSIDE the ring, every comment fixed or answered.
W4 openapi.yaml (valid OpenAPI 3.0, typed responses, required fields, examples, error responses)
   and CONTRACT_QUESTIONS.md: 3 specific questions on Kazi's contract.
W5 GETs implemented and verified field by field; CONTRACT_DEVIATIONS.md.
W6 Writes with validation first; correct 201/200/204/400/404/409; PUT idempotent; bad-input tests.
W7 __tests__/ per resource (happy path, validation, not found, edge case; shape assertions);
   partner-tests/ written from Kazi's contract alone and run against Kazi's live URL;
   PARTNER_TEST_RESULTS.md with each failure classified.
W8 /docs complete; README.md (overview, auth, real request + response per major endpoint, error
   format, clean-clone run steps, one copy-paste curl); BLIND_TEST_REPORT.md.
Each week is submitted on a weekNN-submission branch with a pull request.
Git: `main` is the default branch and what Render deploys. Do each phase on a short branch from
`main` and merge it back by pull request; each week's submission goes on a weekNN-submission
branch with a pull request, as the handouts require. Run `git branch --show-current` before
committing, and never commit straight to `main`.

# How you work
- Phase by phase, in week order. Finish, test and summarise one phase, then stop for review.
- Before every commit: npm run typecheck, npm test and npm run verify all pass. No `any` unless a
  comment explains why.
- Validate before writing. Parameterised SQL only. scrypt for passwords; store only hashes of
  tokens and API keys. Never commit .env or secrets.
- Never invent interview notes, peer-review comments, partner test results, blind-test outcomes or
  screenshots: create the files with the handout's headings and TODO markers, filled only with
  what the humans give you.
- Never send real personal data to Kazi: seed graduates are fictional.
- Stop and ask before: handing off openapi.yaml; changing it after handoff; deleting data;
  deploying; anything outside this repo.

# First task
Phase 0: scaffold the TypeScript Next.js app (package.json, tsconfig.json, server.ts with
createServer and the WebSocket upgrade hook, proxy.ts, next.config.ts, Tailwind v4 setup,
lib/http.ts, lib/db with the Store interface, migrations and the in-memory store, jest config,
.env.example, run.sh), save Kazi's live openapi.yaml to partner-tests/kazi_openapi.yaml and
generate types/kazi.d.ts. The humans will give you starter documents (README, TEAM_CHARTER,
CONTRIBUTORS, API_NEEDS, ENDPOINT_LIST, openapi.yaml, CONTRACT_QUESTIONS, CONTRACT_DEVIATIONS,
VERIFICATION, PARTNER_TEST_RESULTS, BLIND_TEST_REPORT, .env.example); keep them and their TODO
markers. Show me the
tree and the output of `npm run typecheck` and `npm test`, then stop.
