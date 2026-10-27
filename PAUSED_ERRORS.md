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
| Ujuzi | Our own endpoints exist, so partners can call them | Phase 0 only: no partner endpoints yet | All 24 operations of the 0.2.0 contract are built and verified (164 cases, strict), including reading Kazi Connect (job matches, applications, live status). Tested against a local fake Kazi; a check against the real local Kazi on 4002 is recorded below when run. See VERIFICATION.md. |

## Entries

Format for each entry:

**PE-N: short title** (date seen)
- What was run: the exact command
- What came back: status and body, verbatim
- Waiting on: which system and which part is missing or unconfirmed
- Re-check with: the exact command to run again
- Status: paused / re-run on DATE: still failing (genuine) / re-run on DATE: passes (was a missing component)

No entries yet: nothing seen so far has been caused by a missing partner part.
