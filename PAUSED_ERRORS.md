# Paused errors

Errors we have seen but are not fixing yet, because the cause may be a part of Kazi Connect, Sherehe or the ring itself that is not built yet. Nothing here is fixed or "worked around" in Ujuzi's code until the partner part exists. When the partners report they are done, every entry is re-run and sorted into one of two outcomes:

- **Still fails after the partner part exists: a genuine error.** It moves into the normal fix list.
- **Passes after the partner part exists: it was a missing component.** No change to our code.

Entries are copied from real runs only: the command, the status and body as received, nothing reworded or guessed. This file is not in CLAUDE.md's repo structure; drop it if the team prefers another place.

## Readiness signals to watch

| System | Signal that its part is ready | Baseline when this file was created (2026-10-20) | Now |
|---|---|---|---|
| Kazi Connect | Live `openapi.yaml` `info.version` moves from 1.2.1 (1.3.0 adds endpoints 22-25 only), and endpoints 1-9 answer as the contract says | 1.2.1, identical to `partner-tests/kazi_openapi.yaml` | Still 1.2.1 when last checked, 2026-10-20. `GET /api/jobs?status=active` answered 200 with 9 jobs, after a 23 s wake-up. |
| Sherehe | Sherehe's live URL is known and it has handed us its contract | TODO: URL from the humans | TODO |
| Ujuzi | Our own endpoints exist, so partners can call them | Phase 0 only: no partner endpoints yet | All 24 operations of the 0.2.0 contract are built and verified (164 cases, strict), including reading Kazi Connect (job matches, applications, live status). Tested against a local fake Kazi, and checked live against the real local Kazi (contract 1.3.0) on 2026-10-27: `npm run ring:check` passes and so do the 38 partner tests. See VERIFICATION.md. |

## Entries

Format for each entry:

**PE-N: short title** (date seen)
- What was run: the exact command
- What came back: status and body, verbatim
- Waiting on: which system and which part is missing or unconfirmed
- Re-check with: the exact command to run again
- Status: paused / re-run on DATE: still failing (genuine) / re-run on DATE: passes (was a missing component)

No entries yet: nothing seen so far has been caused by a missing partner part.

## Not errors, but known gaps and decisions waiting for the team

- **Not yet run against the live Render URLs** (none are deployed): the partner tests and `npm run ring:check`. Run them with `KAZI_URL=<live Kazi>` and `UJUZI_API_URL`/`UJUZI_API_KEY` once deployed.
- **Not covered by the partner tests** because they need an employer login at Kazi: accepting an application, and the 409 for changing or withdrawing one that is no longer pending. Ujuzi handles both (the fake Kazi in `__tests__/helpers/kaziStub.ts` tests it), but it has not been seen against the real Kazi.
- **`partner-tests/kazi_openapi.yaml` is still Kazi 1.2.1.** Kazi's contract on disk is 1.3.0; for endpoints 1 to 9 the only differences are wording ("SettleIn" became "Ujuzi"). Refreshing the frozen copy is the team's decision.
- **Sign-in is rate limited (Week 9) but accounts are not locked out, and there is no password reset.** An attacker is held to 10 tries a minute per address (about 14,000 a day), not stopped; a botnet with many addresses is not slowed by a per-address limit.
- **Rate limiting has only been seen on this machine.** The counters are in memory (a restart clears them; two server copies count separately). On Render, `TRUST_PROXY=true` reads the last entry of `X-Forwarded-For`; whether that entry is the real caller depends on Render's proxy chain, which has not been checked. Without it, or if it is wrong, every visitor shares one bucket. Check on the first real deployment with two different clients.
- **A partner key can read any booking by id**, not only the ones its holder made. Fine with one partner (Sherehe); with a second partner key the bookings would need an owner column. Recorded in SECURITY_AUDIT.md.
- **A method a route does not have (for example `PUT /api/courses`) answers `405` with an empty body**, Next's own answer, instead of `{ "message": "..." }`. Nothing is revealed; it is the one error that breaks the "every error is { message }" rule. Not fixed: the contract does not list a 405.
- **The 7 PostgreSQL parity tests are skipped** unless `TEST_DATABASE_URL` is set; `npm test` without it covers the in-memory store only.
- **Seeded demo accounts share one public password** (`ujuzi-demo-pass`). Set `SEED_PASSWORD` on any deployment other people can reach, or do not seed it.
- **The website pages have not been looked at in a browser.** They build, serve, and call the same API the tests cover, and their client helpers are unit-tested, but nobody has clicked through them; Swagger UI on `/docs` has not been seen running under React 19 either. Check `/`, `/login`, a course page, `/my-applications` (including the live status line), `/staff` and `/docs` by eye.
- **`render.yaml` is a blueprint, not a deployment.** It sets `SEED_ON_START=true` with a `SEED_PASSWORD` that must be filled in by hand; Render's free PostgreSQL has a limited life, so check its terms before relying on it.
- **Homebrew's `node` was broken on this machine** by a `brew upgrade` (it looks for `libsimdutf.36.dylib`). The agents work around it per command; the lasting fix, `brew reinstall node`, is yours to run.
