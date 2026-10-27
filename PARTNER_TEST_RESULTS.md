# Ujuzi API: Partner Test Results (Week 7)

Our ring: **Kazi Connect** is upstream of us and **Sherehe** is downstream. Only contracts were exchanged, never test files, and each side ran its tests against the other's live, running API.

## 1. What Sherehe's tests found in our API

- What we shared: `openapi.yaml` version TODO, and our live URL TODO.
- What they ran, and against which URL: TODO
- Result: TODO ("nothing failed, all passed" is a real and valid result)

| Failure | Classification (real bug / contract ambiguity / misunderstanding) | What we did |
|---|---|---|
| TODO | | |

## 2. What our tests found in Kazi Connect's API

Our tests are in `partner-tests/kazi.partner.test.ts`, written only from Kazi's contract (frozen copy: `partner-tests/kazi_openapi.yaml`). Run them with `npm run test:partner` against https://kaziconnect1-1xmu.onrender.com.

- Result: **38 of 38 passed** on 2026-10-27, run by the Ujuzi agent with `KAZI_URL=http://localhost:4002 npm run test:partner` against the local ring's Kazi Connect (contract 1.3.0; the tests were written from the frozen 1.2.1 copy). No test failed, so there is nothing to classify. Every application the tests created was withdrawn again. **Not yet run against the live Render URL**, and not covered because they need an employer login: accepting an application, and the 409 for changing or withdrawing one that is no longer pending.

| Failure | Classification | Raised with Kazi Connect / outcome |
|---|---|---|
| None in the run above | | |

## 3. Our own suite

564 tests in 19 suites passed in a clean clone on 2026-10-27 (plus 7 PostgreSQL-only tests that pass when `TEST_DATABASE_URL` is set, 484 in all at the earlier count); `npm run verify` passed strict with 164 cases (VERIFICATION.md). TODO (the team): re-run and update this line at submission.
