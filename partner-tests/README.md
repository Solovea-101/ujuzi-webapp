# Partner tests (Week 7)

Our tests against Kazi Connect's API, written only from Kazi's contract (`kazi_openapi.yaml`, a frozen copy of the live contract). We never see Kazi's code or test files.

Run them against Kazi's live server (endpoints 1-9 need no key):

```bash
KAZI_URL=https://kaziconnect1-1xmu.onrender.com npm run test:partner
```

The tests create applications and must withdraw every one they create, so the live listings are left as they were. Record every failure in `PARTNER_TEST_RESULTS.md`, classified as a real bug, a contract ambiguity or a misunderstanding.
