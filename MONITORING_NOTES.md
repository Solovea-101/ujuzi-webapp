# MONITORING_NOTES.md

Week 12: logs and numbers for the Ujuzi API. Built: `lib/monitoring.ts` (one JSON line per request, and the running totals), `GET /api/stats` (`app/api/stats/route.ts`), `scripts/traffic.ts`, tests in `__tests__/monitoring.test.ts`. The monitor runs **first** in `server.ts`, before the rate limit and every key check, so rejected requests (401, 429, a broken URL) are logged too.

## Part A: what is recorded, and the prediction

| Logged | Never logged |
|---|---|
| time, method, **path only**, status, response time in ms (a precise clock), who called | an API key or token (not even part of one), a password, a request or response body, a query string |

"Who called" is `key-xxxxxx` (the first six characters of the SHA-256 of a valid partner key, plus the partner's configured name), `bad-key` (a key that matched nothing), `login` (a website login token was sent; it is not checked here) or `none`. Only `/api` is logged, because pages and assets would drown it. Set `LOG_REQUESTS=false` to turn it off; it is off by default under `npm test`.

**Prediction (to be written by the team):** TODO. Which endpoint do you think will be slowest, and which will produce the most errors, and why? The handout asks for this *before* any data is seen. I, the coding agent, have already seen the data below, so anything I wrote here would not be a prediction; it has to be the team's own, written honestly with that in mind.

## Part B: sample log lines (real, from the test instance on port 4013, 2026-11-05)

```
{"time":"2026-11-05T14:20:22.630Z","method":"GET","path":"/api/courses","status":200,"ms":41,"caller":"key-55dc13","partner":"labs"}
{"time":"2026-11-05T14:20:34.991Z","method":"GET","path":"/api/courses/crs_501","status":200,"ms":8.8,"caller":"key-3b265a","partner":"sherehe"}
```

and, from the first instance on 2026-11-04, the same request with a wrong key and with no key:

```
{"time":"2026-11-04T09:09:22.601Z","method":"GET","path":"/api/courses","status":401,"ms":1.9,"caller":"bad-key"}
{"time":"2026-11-04T09:09:22.611Z","method":"GET","path":"/api/courses","status":401,"ms":1.7,"caller":"none"}
```

The first of those was sent with `?county=Nairobi` and the query is not in the line. On 2026-11-04 `grep -c "<the real key>" requests.log` printed **0**. `*.log` is in `.gitignore`.

## Part D: traffic

Three kinds of traffic reached the instance on port 4013 on 2026-11-05: my own `npm run traffic` (a mix of good reads, missing ids, no key, a path that does not exist, and an empty `POST /api/bookings`), and **two read-only bursts of 100 calls from Sherehe** with its own key, sent from Sherehe's terminal. On 2026-11-04 I also sent 200 requests, 50 ms apart, to see the limit: the script's own summary was `{ '200': 34, '400': 6, '401': 14, '404': 11, '429': 135 }`. **135 of 200 were 429s**: the key's limit is 100 a minute, so past the hundredth call the API refused the rest, as designed; Kazi's limit on us is the same 100 a minute, so a loop of ours would meet it there too.

Final `GET /api/stats` before the instance was stopped for Sherehe's drill (saved in full in `evidence/labs/stats-4013-2026-11-05.json`):

| | |
|---|---|
| total requests | **183** since 14:20:22Z (uptime 634 s) |
| 4xx (the callers') / 5xx (ours) | **67 / 0**, so `errorRatePercent` is **0** |
| average response time | **10.3 ms** |
| by status | 200: 116, 404: 34, 401: 18, 400: 15 |
| by caller | `key-3b265a` (sherehe) 106, `key-55dc13` (labs, me) 59, `none` 18 |

| Route | count | 4xx | 5xx | avg ms | max ms |
|---|---|---|---|---|---|
| GET /api/courses | 100 | 28 | 0 | 6.5 | 106.7 |
| GET /api/courses/{courseId} | 44 | 15 | 0 | 17.8 | **619.7** |
| GET /api/certificates/{certificateNo} | 27 | 15 | 0 | 12.8 | 139.5 |
| POST /api/bookings | 5 | 5 | 0 | 15.4 | 63.2 |
| GET (no route) | 4 | 4 | 0 | 3.9 | 7.9 |
| GET /api/stats | 3 | 0 | 0 | 1.9 | 2.6 |

## Part E: what the data shows

**Predicted vs found:** TODO (the team's prediction is needed first; see Part A).

**A real pattern, with figures.** `GET /api/courses/{courseId}` has the slowest average (**17.8 ms**) and the slowest single call of any route (**619.7 ms**), against a median for the same route of a few milliseconds; 15 of its 44 calls were 404s (the traffic asks for `crs_9999` on purpose). Every other route averages under 13 ms. The 619.7 ms call was one request, at 14:30:22.837Z, made by my own traffic script at the start of a busy minute, when Sherehe's drill was also running; the next call to the same route took 8.8 ms.

**Why I think it happens (a hypothesis, not a finding):** the slow call looks like a one-off, not something about the route, because the same route answered the same way in a few milliseconds before and after it; at that minute the laptop was also running other builds (load average above 6, under 70 MB of free memory), which is a better candidate than the query. What I would check next: send 1000 calls to that route in a quiet minute and see whether anything above 50 ms shows up again; log the time of every request above 100 ms, and compare them with the machine's load; and look at whether the first request after a restart of the server is always the slow one (the first `GET /api/courses` after startup took 41 ms, the first `POST /api/bookings` 63.2 ms, against a median of about 3.5 ms for both).

**An alert I would want in production (a draft for the team to confirm or replace):** `errorRatePercent` above **2 %** for **5 minutes** (a 5xx is ours, a 4xx usually the caller's). When it fires, a person is paged. While they look, Ujuzi should already be doing what Week 11 built: the course page shows the saved jobs, flagged, when Kazi is the cause, and the other routes keep answering, so the user does not see a failure while the human fixes it. A second number to watch is `kazi.failures` (and `kazi.staleServed`) in the same response: if they climb while `errorRatePercent` stays at 0, Kazi is the problem and our users are being protected by the saved copy.

**Honest limits.** The numbers live in memory: they restart from zero with the server (the first instance lost its totals when the machine restarted) and would be wrong across several copies of the server. `/api/stats` does not count itself in its own reply, but appears in the next one. `(no route)` holds the requests for paths we do not have, such as `/api/not-a-route`; a 401 or 429 is counted under its own route, since the monitor knows the path before anything rejects it (the handout's `(no route)` row also holds those; read the log lines to tell them apart).
