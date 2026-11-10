# Tickets: Weeks 10 to 12 (Ujuzi sub-team)

Work that the coding agent could not or should not do. Each ticket says what, why it is a human's, and how to know it is done. Everything the agent could do is already on the local branch `labs-week10-12` (nothing pushed).

| # | Ticket | Owner | Blocks |
|---|---|---|---|
| 1 | Write the monitoring predictions | Team members | Week 12 reflection (6 pts) |
| 2 | Tell Sherehe's sub-team about contract 0.5.0 before any deploy | Team lead | Deploying 0.5.0 (R8) |
| 3 | Decide: refresh the frozen Kazi contract to 1.3.1? | Team | Nothing urgent |
| 4 | Push the work and open the pull requests | Team lead | Submission |
| 5 | After the live deploy: repeat the integration checks against the live URLs | Whoever deploys | Live demo (15 pts) |
| 6 | Rehearse the three-step demo and book the check-in | Team | Live demo |
| 7 | Confirm Kazi's listener warning with a live count | Kazi sub-team | INTEGRATION_LOG row 9 |
| 8 | Sherehe's second drill (their new behaviour against ours) | Sherehe sub-team | Their Week 11 evidence |

## 1. Write the monitoring predictions

**Why a human:** the handout wants a prediction made before the data is seen. The agent had already seen it, so it would not be a prediction.
**What:** in `MONITORING_NOTES.md`, Part A, write which endpoint you expect to be slowest and which to produce the most errors, and why, honestly (you can now read the real numbers in Part D, so say you wrote it afterwards, or run a new burst first: `npm run traffic`). Then fill "Predicted vs found" in Part E, and confirm or replace the two drafts there (the hypothesis about the 619.7 ms request and the alert idea: `errorRatePercent` above 2 % for 5 minutes).
**Done when:** the two TODO markers in `MONITORING_NOTES.md` are gone and the text is yours.

## 2. Tell Sherehe's sub-team about contract 0.5.0

**Why a human:** CLAUDE.md R8: any contract change after handoff gets a `CONTRACT_DEVIATIONS.md` entry (written, 0.5.0) and the humans tell Sherehe's sub-team **before it is deployed**. The agents agreed names with each other, but an agent cannot approve for the team.
**What:** tell them 0.5.0 adds `GET /api/stats` (Endpoint 26, partner key) and two response headers on `GET /api/courses/{courseId}/job-matches` (`X-Data-Stale`, `X-Data-As-Of`); nothing in S1 to S5 changes. Give them the new `openapi.yaml` when you are ready (handing it over is your call, per CLAUDE.md). Sherehe's agent has already said it will use the same two header names.
**Done when:** Sherehe's sub-team has acknowledged it, and you have noted the date in the "Flagged to Sherehe" line of the 0.5.0 entry in `CONTRACT_DEVIATIONS.md`.

## 3. Decide: refresh the frozen Kazi contract to 1.3.1?

**Context:** `partner-tests/kazi_openapi.yaml` is 1.2.1; the live Kazi serves 1.3.1 (INTEGRATION_LOG row 2). For endpoints 1 to 9 the paths and fields are unchanged; the new parts are an `ApiKey` scheme, documented `401` and `429` answers, and endpoints Ujuzi does not use. Kazi's agent says 1.3.1 only changes Endpoints 7 to 9 for `usr_` account ids; ours are `grd_`.
**Recommendation:** refresh it. It is what Kazi will actually serve, and our client already sends `KAZI_API_KEY` and handles `401` and `429`. Steps: copy the live `/openapi.yaml` over the file, run `npm run types`, then `npm run typecheck`, `npm test` and `npm run test:partner` (against a Kazi that serves 1.3.x), update `PAUSED_ERRORS.md`. Risk: the partner tests are meant to be written from the contract alone (R6), so re-read them against the new text.
**Done when:** a decision is written in `PAUSED_ERRORS.md` (refresh or leave, and why). The agent will do the steps if you say refresh.

## 4. Push the work and open the pull requests

**Why a human:** you told the agent not to push or touch `main` or `uat`, and the team has not said where this goes.
**What:** the work is one local commit (plus the later contract commit) on `labs-week10-12` in `/Users/solovea/Developer/ujuzi-labs`, which has no remote. CLAUDE.md wants each week on its own `weekNN-submission` branch with a pull request, merged by you. Tell the agent where to push; it can split the commit into Week 10, 11 and 12 branches. The gate to pass first (done on the branch): `npm run typecheck`, `npm test`, `npm run verify`.
**Done when:** three pull requests exist (or one, if your instructor accepts it), with `.env` and `requests.log` not in the diff.

## 5. After the live deploy: repeat the checks against the live URLs

**Why a human:** the live deployments are your colleagues'.
**What:** (a) Part B again: `curl -i -H "X-API-Key: <the key Kazi issued>" <live Kazi>/api/jobs?status=active` and note the result as a new row in `INTEGRATION_LOG.md` (the only live fact so far is the 57.8 s cold start, row 1). (b) `GET <live Ujuzi>/api/stats` with a partner key. (c) The agent can run `npm run ring:check` and the stop/start drill once you give it the live URLs and keys in a file outside the repo. (d) Set `TRUST_PROXY_HOPS` from the real logs (see `PAUSED_ERRORS.md`). (e) Set `KAZI_API_KEY` in Render's settings only when Kazi switches keys on; never commit it.
**Done when:** the live rows are in the log and `README.md` lists the live URLs (R3).

## 6. Rehearse the three-step demo and book the check-in

**Why a human:** it is a live demo for the instructor, and the check-in slot is on a shared sheet.
**What:** (1) the course page shows live Kazi jobs; (2) Kazi stops and the page shows the saved jobs with the banner (`evidence/labs/saved-jobs-2-partner-stopped-banner.png` shows what to expect; the saved copy needs the page opened once first, and the default cache is 5 minutes, so set `KAZI_CACHE_MS=4000` for the rehearsal); (3) Kazi restarts and live data comes back. Also show `GET /api/stats` and a few lines of the log.
**Done when:** you have run it once end to end, and a TA check-in is booked.

## 7. Kazi's listener warning (Kazi sub-team)

**What:** Kazi's agent saw `MaxListenersExceededWarning: 11 statusChanged listeners`. The ring's Ujuzi holds 14 pending applications and opens one WebSocket for each, which fits (INTEGRATION_LOG row 9). Ask Kazi to count live connections when it next sees the warning, and decide whether to raise its listener limit.
**Done when:** row 9 says confirmed or not, and what Kazi did.

## 8. Sherehe's second drill

**What:** Sherehe's agent will ask for one more stop/start of Ujuzi once its own saved-data behaviour is built. The agent can do it again on the test instance (port 4013). Nothing needed from you unless you want to watch.
**Done when:** both sides' results are in each team's `INTEGRATION_LOG.md`.
