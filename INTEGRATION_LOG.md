# INTEGRATION_LOG.md

Week 10: calling our partners' live APIs. Ujuzi sits in the middle of the ring (Sherehe -> Kazi Connect -> Ujuzi -> Sherehe), so it has **one upstream** (Kazi Connect, which Ujuzi calls) and **one downstream** (Sherehe, which calls Ujuzi). This log records every bug or surprise at those two seams, **whoever's code it was in**. Every row below was seen in a real run or reported by the partner's own agent; nothing is invented. Where a row is the partner's account, it says so, and where something is still open it says that too.

**Where this was done:** the local ring (Sherehe 4001, Kazi 4002, Ujuzi 4003), and a Ujuzi test instance on port 4013 that Sherehe called. The live Render deployments are being done by the team and are not part of this log yet (see "Still to do").

## How the Week 10 feature works, and where the lab's names went

The feature that calls the partner is **live job matches**: the course page (`/courses/{courseId}`) shows the live Kazi jobs that match the course's trade, and a graduate applies from there.

| Handout | In Ujuzi |
|---|---|
| `PARTNER_URL` | `KAZI_API_URL` (and `KAZI_WS_URL` for the live-status WebSocket) |
| `PARTNER_API_KEY` | `KAZI_API_KEY`: sent as `X-API-Key` on every Kazi call. Kazi's open endpoints need none, so it may be unset |
| the route `/upcoming` | `GET /api/courses/{courseId}/job-matches`, handled in `app/api/courses/[courseId]/job-matches/route.ts` |
| the page | `app/courses/[courseId]/page.tsx`, which calls our own route and never Kazi |
| the partner call | `lib/clients/kaziClient.ts` (the only file that knows Kazi's paths and fields) through `lib/clients/fetcher.ts` |

The names are fixed by the project's CLAUDE.md, so they differ from the handout's; both are in `.env.example`, which also says the real values live only in the environment. The key is read on the server, so it is never in the page's JavaScript, and the log never holds it. A field spelled differently by Kazi cannot come back "empty" unnoticed: `asJob()` in `kaziClient.ts` checks every field it reads (name, type, and nesting of `payRange`) and drops a job that does not match, and `__tests__/kaziClient.test.ts` has a test for it.

## Part B: the first call, made from a terminal and not from the app

Local ring Kazi, 2026-11-04 08:54:03Z, from my machine, the key being the one Kazi issued to the consumer named `ujuzi`:

```
$ curl -i -H "X-API-Key: <key issued to ujuzi>" "http://localhost:4002/api/jobs?status=active"
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 23300
[{"id":"job_12348","title":"Cafeteria Server","category":"catering","county":"Nairobi","area":"Westlands","duration":"Lunch hours","urgent":true,"status":"active","payRange":{"min":10000,"max":14000}}, ...]

$ curl -i "http://localhost:4002/api/jobs?status=active"                    (no key)
HTTP/1.1 401 Unauthorized
{"message":"Missing or invalid API key"}

$ curl -i -H "X-API-Key: wrong" "http://localhost:4002/api/jobs?status=active"
HTTP/1.1 401 Unauthorized
{"message":"Missing or invalid API key"}
```

Compared with Kazi's contract (`partner-tests/kazi_openapi.yaml`, endpoint 2): status 200, an array, each job has `id`, `title`, `category`, `county`, `area`, `duration`, `urgent`, `status` and `payRange {min, max}`, all with the contract's types. No difference. A missing key and a wrong key give the same 401 with the same words, as Kazi's contract says. Time: 1 to 5 ms for the local Kazi (8 calls). The same read against the live Render Kazi (no key needed there) is in the table below.

## The log

| # | What broke (symptom) | Root cause | Fix | Whose code, and who fixed it |
|---|---|---|---|---|
| 1 | The first call to the **live** Kazi took **57.8 s** (2026-11-04 08:54Z); the five after it took 0.5 to 2.0 s. An earlier wake-up was 23 s (2026-10-20, in `PAUSED_ERRORS.md`). | Kazi runs on Render's free tier, which sleeps after 15 idle minutes; Kazi's README warns the first call can take about a minute. | Week 11: attempts are cut off at 3 s, retried at most twice inside a 10 s budget, and the job panel shows a saved copy (flagged) or a clear message instead of a hung page. The ring check wakes Kazi first. See `RESILIENCE_NOTES.md`. | Nobody's bug: platform behaviour. Handled in Ujuzi's code, by Ujuzi. |
| 2 | **Live Kazi's contract is no longer the one we froze.** Its public spec says 1.3.1; our `partner-tests/kazi_openapi.yaml` is 1.2.1. Diffed 2026-11-04: new paths (`/api/event-openings`, `/api/staffing-offers`, `/api/staffing-offers/{offerId}`, `/api/me/staffing-offers`), an `ApiKey` security scheme, and documented `401` and `429` answers on endpoints 1 to 9. The live `GET /api/jobs` still answers 200 with no key. | Kazi released new versions after we copied its contract; the copy was not refreshed. | **Not fixed.** Endpoints 1 to 9 keep their paths and fields, and Ujuzi already sends `KAZI_API_KEY` when Kazi switches keys on and handles `401` and `429` (Week 9). Refreshing the frozen copy and re-running `npm run types` is the team's decision (see `PAUSED_ERRORS.md`). Kazi's agent adds (2026-11-05): 1.3.1 changes Endpoints 7 to 9 only for account ids that start `usr_`; our ids are `grd_` and work as before. | Neither side's code: version drift. Open, waiting on the team. |
| 3 | A browser calling Kazi directly with `X-API-Key` would be blocked by CORS: `OPTIONS /api/jobs` with `Access-Control-Request-Headers: x-api-key` answers `204` with `access-control-allow-headers: Content-Type, Authorization` (seen 2026-11-04 and 2026-11-05, ring Kazi). | By design, per Kazi's agent (2026-11-05): keys are for servers calling servers, and Kazi's CORS headers were frozen with the contract. The contract never says "server to server only" in one place, so a reader can assume otherwise. | No code change. Kazi adds a sentence to its contract wording. Ujuzi is unaffected: it calls Kazi from its server, and the key is never in the page. | Contract wording vague (Kazi's); fixed by Kazi's wording. I reported it in the handout's bug-report form and Kazi's agent answered the same day. |
| 4 | Swagger's "Try it out" on our own `/docs` answered `404 Error: Not Found` with an empty body (2026-11-03). | The contract names `http://localhost:3000`; on the developer's machine that port was **Kazi's** dev server, so our page was calling the wrong system. | Calls and examples now use the address the page was opened on (`lib/docsOrigin.ts`, commit `3a1bd98`, PR #19). | Ujuzi's code. Fixed by Ujuzi. |
| 5 | `npm run ring:check` failed three steps against Kazi after a run that had filled the first job (2026-10-28). | The script assumed the first job stays open; Kazi's rule that a job has one place made the next apply a `409`. | The check applies to the first job that still takes applications (commit `4ddd57d`, PR #16). The `409` for a filled job was already our own message (commit `bfecf55`). | Ujuzi's script. Fixed by Ujuzi. |
| 6 | Sherehe's write tests against our 0.2.0 failed 7 of 34 (told to us by Sherehe's agent on 2026-11-04, and written in Sherehe's own `CONTRACT_DEVIATIONS.md`). | Their tests reused one event name for several bookings. Our rule (a second pending booking for the same course and event name is `409`) was correct. | Sherehe fixed its tests, and its crew-training endpoint now answers its own `409` message for that case. | Sherehe's tests. Fixed by Sherehe. |
| 7 | **Before Week 11**, our Kazi client threw the cause of a failure away: when Kazi was down or slow, nothing in the log said "ECONNREFUSED" or "timeout". Seen while reading `fetchKazi` for the Week 11 drill. | The `catch` mapped every failure to one message and logged nothing. | Every failure is logged with its cause and counted (`lib/clients/fetcher.ts`, `lib/clients/kaziMetrics.ts`): `kazi GET /api/jobs failed: ECONNREFUSED`. Tests in `__tests__/kaziResilience.test.ts`. | Ujuzi's code. Fixed by Ujuzi. |
| 8 | **Before Week 11**, a flaky partner (503, 503, then fine) failed **two page loads in three**, and a slow one (answers after 10 s) made the page wait **10.01 s** and then show a 502. Measured 2026-11-04 against a stand-in. | No retries, and the 10 s limit was one attempt. | `resilientFetch.ts`: up to 2 retries after 200 ms and 400 ms, each attempt at most 3 s, 10 s in all. Measured after: flaky now succeeds in 0.61 s; see `RESILIENCE_NOTES.md`. | Ujuzi's code. Fixed by Ujuzi. |
| 9 | Kazi's own log has a `MaxListenersExceededWarning: 11 statusChanged listeners` (reported by Kazi's agent, 2026-11-04): it appears when more than 10 subscriptions on Endpoint 6 are open at once. | Ujuzi opens **one WebSocket per pending application** it follows. The ring's Ujuzi database holds **14 pending applications** (read 2026-11-05: accepted 34, cancelled 37, filled 28, pending 14), so with Ujuzi running there are 14 subscriptions, above Node's default of 10 listeners per event. That matches, but I have not yet seen the warning appear with the count of subscriptions in hand. | None yet. Ujuzi's behaviour is as designed (one per pending application, closed at a final status). Whether to raise Kazi's listener limit is Kazi's decision. | Not a bug in either design as far as I can tell: a limit meeting normal use. Open; Kazi's agent is going to count connections when it next sees the warning. |

## Part D and E: partners stopped and started, partners calling us

These were done **with the partners' agents, on the ring**, and each side wrote down what it saw. (Times UTC, 2026-11-05.)

| What was done | What Ujuzi's side saw | What the partner's side saw |
|---|---|---|
| **Sherehe calls Ujuzi** (test instance on 4013): two read-only bursts of 100 calls with Sherehe's own key, from Sherehe's terminal | Every call logged with caller `key-3b265a` (partner `sherehe`), none refused: no `401` and no `429` on its key. Statuses as the contract says (200, 404 for a missing course or certificate, 400 for a bad filter). Average 4.3 to 4.6 ms. | Sherehe's counts and ours agreed after two corrections that were both on our side of the counting (see the next section). It reported all answers "as the contract says". |
| **Ujuzi stopped for Sherehe** at 14:30:49Z, started again at 14:31:49Z (about one minute), no code change | `ECONNREFUSED` for anything calling 4013 while stopped. | Sherehe's drill went from LIVE to DEGRADED in the same second (14:30:49), showed its own friendly `502` 29 times (3 to 41 ms each), logged `Ujuzi could not be reached (ECONNREFUSED)`, and answered `200` on its other routes the whole time. Back to LIVE at 14:31:47 (first `200`, 49 ms), with no change. (My "up" time of 14:31:49 was when I confirmed it was listening, not when it started: Sherehe's first answer came two seconds before it.) |
| **Ujuzi stopped for Sherehe, second drill (Sherehe's new saved-data behaviour)** at 2026-11-10 14:53:13Z, started again at 14:54:24Z (about 71 s), no code change | `ECONNREFUSED` for anything calling 4013 while stopped. | Sherehe's figures, **corrected by Sherehe** (its first printout was wrong: its drill script labelled any HTTP 200 as LIVE, so saved copies were shown as LIVE between 14:53:50Z and about 14:54:10Z; the script was fixed and now shows SAVED, LIVE and DEGRADED). DEGRADED from 14:53:14Z. From 14:53:22Z a question it had asked live at 14:47:39Z came back as a **saved copy** in 612 ms with `X-Data-Stale: true` and `X-Data-As-Of: 2026-11-10T14:47:39Z`; a question never asked gave its own `502` (609 ms); a certificate check gave its own `502` (never a saved copy); its other routes answered 200; its log said `Ujuzi could not be reached (ECONNREFUSED); answering with the saved copy from 2026-11-10T14:47:39Z`. First confirmed LIVE answer 14:54:30Z (HTTP 200, 5 ms, no stale header). The six seconds after Ujuzi's 14:54:24Z are only because Sherehe restarted its own drill; it has no live answer between those times, so they are not Ujuzi's recovery time. |
| **Ujuzi calls Kazi with traffic** (Week 12 Part D, partner side): 60 paced read-only requests (700 ms apart, about 85 a minute) to the ring Kazi on 4002 with the key named `ujuzi`, 2026-11-10 15:01:46Z to 15:02:28Z (`evidence/labs/traffic-to-kazi-2026-11-10.txt`) | Ujuzi's script sent: `GET /api/jobs` 15, `GET /api/jobs/{jobId}` 15 (7 existing, 8 missing), `GET /api/jobs/{jobId}/status` 13, `GET /api/not-a-route` 9, `GET /api/jobs` with no key 8. Received 200 x35, 401 x8, 404 x17, no 429. | Kazi's own request log for that window (reported by Kazi's agent): 60 lines, nothing else in the window. Caller `ujuzi`: jobs 200 x15, job 200 x7 and 404 x8, status 200 x13, unknown path 404 x9; caller `none`: jobs 401 x8. Average 4.4 ms for the 52 keyed calls, slowest 12.6 ms. **The two counts match kind by kind and status by status; no difference to log.** Note from Kazi: its `/api/stats` counts unknown paths under `GET (no route)` and a 401 under the path asked for, so its stats rows are not split by caller; its log is where callers are told apart. |
| **Kazi stopped for Ujuzi** (ring Kazi on 4002, stopped 2026-11-10 14:33:16Z, started 14:34:02Z, about 46 s, by Kazi's agent; an earlier window on 2026-11-05 was cut short by a restart of the sessions and is void) | Live before (36 jobs, 14:32:53Z). While stopped: the jobs for `crs_501` and `crs_509` came back **saved** (HTTP 200, `X-Data-Stale: true`, `X-Data-As-Of: 2026-11-10T14:32:53Z`) after 0.61 s; a course never read (`crs_505`) answered our own `502 "Kazi Connect could not be reached. Try again in a minute."` after 0.61 s; `GET /api/courses` and `GET /api/courses/crs_501` still answered 200. Log: `kazi GET /api/jobs: attempt 1 of 3 failed (ECONNREFUSED), retrying in 200 ms`, `attempt 2 of 3 ...`, `kazi GET /api/jobs failed: ECONNREFUSED`. `/api/stats` `kazi`: 3 failures, 6 retries, 2 saved copies served. After the start: live data again for both courses (HTTP 200, no flag) with no change on our side. Full output: `evidence/labs/kazi-drill-2026-11-10.txt`. | Kazi's agent stopped it with `ring.sh down kazi` and started it with `ring.sh up kazi`, same build, and says it changed nothing in between; it records the same times on its side. |

## Cross-team work this week

Real exchanges between the three systems' agents (messages are kept in each agent's own session; nothing here is a quotation of a person):

- **Preflight (Part A), 2026-11-04.** Asked both partners the same questions. Kazi answered with its version (1.3.0 on the ring, an older clone), that keys are on with four consumers, that the live Kazi spec is 1.3.1 and open, and its 100-a-minute limit per consumer. Sherehe answered with its own first calls to us (no surprises).
- **A bug report in the handout's form (row 3).** I sent Kazi what I did, expected, got, with evidence and time, and said I might be misreading its contract. Kazi's agent confirmed my reading of the headers and explained the design.
- **One name, not two.** Sherehe and Ujuzi agreed the same saved-data header pair, `X-Data-Stale: true` and `X-Data-As-Of: <UTC, Z, no milliseconds>`, with the body kept a bare array, before either was built on its side.
- **We corrected each other's numbers.** I told Sherehe its burst counts did not reconcile (I had miscounted the no-key calls: my log had exactly its 17); it explained the extra calls (reachability checks and its test copy's own calls, 44 + 2 + 3 = 49), and later corrected its own drill figures (29 degraded lines, not 31). Both corrections are in the table above.
- **Rate limits as a shared fact.** Kazi told us its limit is 100 a minute per consumer; ours is 100 a minute per key. Our traffic script's default (a request every 50 ms) goes past that on purpose, and `traffic.ts` has `PAUSE_MS` to stay under it.

## Still to do

- The live (Render) deployments are the team's: when they are up, repeat Part B against the live URLs and add the rows here. The cold-start row (1) is the only live observation so far.
- Row 2: whether to refresh the frozen Kazi contract.
- Row 9: confirm the cause with Kazi's count of connections.
