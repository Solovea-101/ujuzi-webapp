# Contract Questions: Kazi Connect's API (Week 4)

Three questions about the contract we received from our upstream ring partner, Kazi Connect (`partner-tests/kazi_openapi.yaml`, version 1.2.1, the live contract). Each points at a specific field or endpoint.

> DRAFT, written against Kazi's live 1.2.1 contract. Check them again when Kazi hands off 1.3.0, and replace any it already answers.

1. **Endpoint 6, `GET /api/applications/{applicationId}/subscribe` (WebSocket).** The contract says the server closes the connection after the final `cancelled` message. Does it also close after `accepted` or `filled`, which are final too, or does the socket stay open until we close it? We open one socket per pending application, so we need to know when to stop.

2. **Endpoint 7, `POST /api/applications`, field `studentId`.** The schema only says `type: string, minLength: 1`. Will Kazi accept any id we send, such as our own `grd_0101`, and is there a maximum length? And if we send the same `studentId` and `jobId` twice, do we get a second application or a 409?

3. **Endpoints 1 to 5, error bodies.** Endpoints 1 to 5 answer 400 and 404 with an empty body, while endpoints 7 to 9 send `{ message }`. Will that difference stay in later versions, so our client can rely on reading the status code only for 1 to 5?
