# RESILIENCE_NOTES.md

Week 11: when Kazi Connect, our upstream, is slow, flaky or gone. The feature is the **live job matches** on the course page (`GET /api/courses/{courseId}/job-matches`, called by `app/courses/[courseId]/page.tsx`). All figures below are from real runs on 2026-11-04 and 2026-11-05; where something has not been run yet it says so.

**What was built:** `lib/clients/resilientFetch.ts` (timeout and careful retries), `lib/clients/fetcher.ts` (the budget, the saved copy, the failure log), `lib/clients/kaziMetrics.ts` (counts), the saved-data banner in the course page, and `scripts/flakyPartner.ts` plus `scripts/resilienceDrill.ts` to reproduce it all. Tests: `__tests__/resilientFetch.test.ts` (27), `__tests__/kaziResilience.test.ts`, `__tests__/staleJobMatches.test.ts`.

## What was tested, before and after

The stand-in partner (`npm run partner:flaky`) is a small Kazi that answers `GET /api/jobs` and can be switched between `ok`, `slow` (answers after 10 s), `flaky` (503, 503, then a 200, repeating) and `error` (always 500). "Before" is the code as it was on `main` (commit `1582365`), built in a scratch copy and run against the same stand-in; "after" is this branch. The page asked is the course page's own request, with the job cache switched off (`KAZI_CACHE_MS=1`) so every question reaches the partner.

| Failure | Before: what the user saw | After: what the user saw | What the log said (after) |
|---|---|---|---|
| Partner **slow** (answers after 10 s), nothing saved yet | "Kazi Connect could not be reached. Try again in a minute." after **10.01 s** | The same message after **9.62 s** (3 attempts of 3 s, plus 0.6 s of waiting; the stand-in saw exactly 3 requests) | `kazi GET /api/jobs: attempt 1 of 3 failed (timeout), retrying in 200 ms`, then `attempt 2 of 3 ... retrying in 400 ms`, then `kazi GET /api/jobs failed: timeout` |
| Partner slow, a good answer saved earlier | The same message after 10.01 s | The **saved jobs** (HTTP 200, `X-Data-Stale: true`, `X-Data-As-Of: 2026-11-05T14:31:31Z`) with the banner "Showing saved jobs from ...", after **9.64 s** | the three lines above, then `kazi data served from saved copy (saved 2026-11-05T14:31:31Z): Kazi Connect did not answer in time` |
| Partner **flaky** (fails twice, then works) | Fails, fails, works: **two page loads in three showed the error** (0.01 s each) | **Every load worked**, each after 0.61 s (3 requests to the partner per load) | per load: `attempt 1 of 3 failed (HTTP 503), retrying in 200 ms` and `attempt 2 of 3 failed (HTTP 503), retrying in 400 ms` |
| Partner **always errors** (500), nothing saved | The message, at once (1 request) | The message after **0.61 s**: exactly **3 requests** (the first and 2 retries), then it stops | `attempt 1 of 3 failed (HTTP 500)`, `attempt 2 of 3 ...`, `kazi GET /api/jobs failed: HTTP 500` |
| Partner always errors, a good answer saved | The message | The saved jobs after 0.61 s | the lines above, then `kazi data served from saved copy ...: Kazi Connect answered 500` |
| Partner **stopped** (nothing listens) | The message, at once | The message after 0.6 s; with a saved copy, the saved jobs | `kazi GET /api/jobs failed: ECONNREFUSED` (tested in `__tests__/kaziResilience.test.ts`; `ENOTFOUND` for a wrong host name is tested too) |
| Partner back | Live data | **Live data again with no restart and no code change** (`ok again: live data is back`, 0.09 s) | nothing |

The "after" rows are the output of `npm run drill:resilience`, saved in `evidence/labs/drill-resilience-2026-11-05.txt`. The partner stopped for real, with Sherehe watching, is in `INTEGRATION_LOG.md` (Sherehe's side of Ujuzi stopping); **the drill with the real Kazi on the ring, Kazi stopped for 46 seconds (2026-11-10 14:33:16Z to 14:34:02Z), was done too**: saved jobs with the flag for the two courses read before (0.61 s), our own message for one never read (0.61 s), the other routes still 200, log `ECONNREFUSED` with two retries, and live data again after the start with no change (`evidence/labs/kazi-drill-2026-11-10.txt`). An earlier attempt on 2026-11-05 was cut short by a restart of the sessions and is void. **One odd measurement:** the first run of the slow case recorded **121.28 s** instead of about 9.6 s. It did not repeat (the same case, on a fresh instance, took 9.62 s by the client and 9617.6 ms in Ujuzi's own log), and the machine was busy at the time (load average above 6, under 70 MB of free memory). I did not find the cause and I do not claim one.

## My numbers, and why

| Setting | Value | Why |
|---|---|---|
| Timeout for **one attempt** at a read | **3000 ms** (`KAZI_ATTEMPT_TIMEOUT_MS`) | Measured normal: the ring Kazi answers in 1 to 5 ms (8 calls); the live Render Kazi, awake, in 0.51, 0.60, 0.67, 1.27 and 1.98 s (2026-11-04). The handout's 1500 ms would have cut off the slowest of those five. 3 s is about 1.5 times the slowest awake call. |
| Retries | **2** (`KAZI_RETRIES`) | The handout's cap. Reads only; never a write, never a 400, 401, 403, 404 or 409. |
| Wait before a retry | **200 ms, then 400 ms** (`KAZI_RETRY_DELAY_MS`) | Short and doubling, so a struggling partner is not hit in a tight loop. A 429 is waited for if its `Retry-After` is 5 s or less and fits in the budget; a longer one is handed back at once. |
| Total budget for a read a person waits on | **10 000 ms** (`KAZI_USER_TIMEOUT_MS`) | The project's CLAUDE.md fixes 10 s when a user waits; all attempts and waits together fit inside it, and an attempt is cut to what is left. |
| **Worst case** | 3 x 3000 + 200 + 400 = **9600 ms** | Under the budget. Measured: 9.62 s and 9.64 s. |
| A write (apply, change, withdraw) | one attempt, 10 s, no retry | A retry might apply twice. Kazi has a 409 for an application that exists, but not every write is safe to repeat. |
| The background status poll | one attempt, 60 s | Nobody is waiting, and the poller tries again at its next turn (every 2 minutes). |
| Saved copy kept for | **1 hour** (`KAZI_STALE_MS`) | Jobs fill quickly (a job has one place). An hour-old list is useful with a banner; a day-old one would mislead. Kazi's own `409` still refuses an apply for a job that has filled. |
| Fresh cache | 5 minutes (`KAZI_CACHE_MS`, already there) | It also answers the handout's "429: call less often": within 5 minutes a repeat question never reaches Kazi. |

**Cold start.** The live Kazi's first call after it slept took **57.8 s** (2026-11-04). No timeout a person would sit through can absorb that. What the page does instead: the first person after a sleep sees the saved jobs, or the message "Try again in a minute", and the attempts they started are what wakes Kazi, so the next look works. Making the first call wait a minute would not be better for them.

## What a real user would experience without this code

A graduate opens the course page for "Food hygiene and event service" on a phone, to see which catering shifts they could apply for. When Kazi has gone to sleep on its free server, the "Live casual jobs" panel shows grey placeholders for ten seconds, then a red "Kazi Connect could not be reached" message with a Try again button. The graduate taps it; if Kazi is only flaky, two taps in three fail and one works, and they cannot tell that waiting would have helped, so many will give up and go to another app, and the shifts they came for go to someone else. If Kazi is slow rather than down, each tap costs another ten seconds of looking at placeholders. With this code, a graduate who looked at the jobs a few minutes ago sees the same shifts straight away, clearly marked as saved from a stated time, and one who has not sees a message after about ten seconds, with Kazi already being woken by the attempts. A flaky Kazi is invisible to them.

## What I did not build

A **circuit breaker** is a switch that stops calling a partner that has been failing for a while and tests it only occasionally; ours still tries every request three times, so a Kazi that is down for an hour is asked three times by every page load, whereas a breaker would answer from the saved copy straight away and let one request through every so often to see whether Kazi is back.

## Still to do

- Screenshots of the saved-jobs banner are in `evidence/labs/` (`saved-jobs-1` to `-4`: live, partner stopped with the banner, partner stopped with nothing saved, partner back). They are real captures of the real course page in a headless browser at phone width, on 2026-11-10 at 14:39Z, but the partner was the **stand-in** (`npm run partner:flaky`, stopped and started for real), not the ring's Kazi. The team may want its own capture against the real partner at the live demo.
- The two headers (`X-Data-Stale`, `X-Data-As-Of`) are in `openapi.yaml` 0.5.0 on this branch, with a `CONTRACT_DEVIATIONS.md` entry. It is a contract change after handoff, so **the team must tell Sherehe's sub-team before 0.5.0 is deployed** (R8). Sherehe's agent has agreed to use the same names in its own saved-data fallback.
