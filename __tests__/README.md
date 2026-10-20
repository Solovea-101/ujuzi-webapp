# Automated tests (Week 7)

One test file per resource: courses, certificates, bookings, Kazi applications, the Kazi subscriber, and auth. Every endpoint is covered for the happy path, validation failures, not found and at least one edge case, and assertions check the response shape, not just the status code.

`helpers/server.ts` starts `createServer()` once; `helpers/kaziStub.ts` is a tiny local Kazi Connect (HTTP and WebSocket) built from the examples in `partner-tests/kazi_openapi.yaml`, so `npm test` never needs the live partner.

Run with: npm test
