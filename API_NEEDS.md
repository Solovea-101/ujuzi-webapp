# API Needs Statements: Ujuzi

Format: *"[Consumer] needs to [verb] [resource] in order to [reason]."*

> DRAFT. These statements are the positions Ujuzi takes into the Week 2 interviews. Rewrite each one with what Sherehe and Kazi Connect actually say, then delete this note. Week 2 grades "statements reflect actual partner interview (not guessed)".

## Sherehe's needs from us (downstream)

| # | Statement | Freshness | Volume | Auth |
|---|---|---|---|---|
| S1 | Sherehe needs to read short courses by category and county, with duration, fee and next start date, in order to show organisers which training fits each crew role. | Daily | Per role page | Partner key |
| S2 | Sherehe needs to verify a certificate number in order to confirm a crew member finished a course before the organiser relies on them. | Real time | Per crew member checked | Partner key |
| S3 | Sherehe needs to create a group training booking for an event crew in order to have them trained before the event date. | Immediate | A few per week | Partner key |
| S4 | Sherehe needs to read a booking's status in order to show the organiser whether the training is confirmed. | Within the hour | Per booking viewed | Partner key |
| S5 | Sherehe needs to reschedule or cancel a pending booking in order to follow changes to the event date. | Immediate | Rare | Partner key |

## Our needs from Kazi Connect (upstream)

| # | Statement | Kazi endpoint(s) | Freshness | Auth |
|---|---|---|---|---|
| U1 | Ujuzi needs to read active Kazi jobs in order to show graduates live demand on each course page. | 1 | Within the hour | None today |
| U2 | Ujuzi needs to read active jobs filtered by a course's category and the graduate's county in order to list "jobs for this skill near you". | 2 | Within the hour | None today |
| U3 | Ujuzi needs to read a job's details, pay range and availability in order to show expected earnings before a graduate applies. | 3, 4 | Real time for status | None today |
| U4 | Ujuzi needs to create an application on a graduate's behalf in order to let them apply straight from their course dashboard. | 7 | Immediate | None today |
| U5 | Ujuzi needs to read and subscribe to an application's status in order to tell the graduate the moment they are accepted or the job is filled. | 5, 6 | Real time | None today |
| U6 | Ujuzi needs to reschedule or withdraw a pending application in order to let graduates change their start date or cancel. | 8, 9 | Immediate | None today |

## The Ujuzi website's own needs

| # | Statement |
|---|---|
| G1 | The Ujuzi website needs graduates and centre staff to create an account and log in, in order that enrolments, applications and decisions belong to a real person. |
| G2 | The Ujuzi website needs graduates to browse courses and enrol, in order to start training. |
| G3 | The Ujuzi website needs graduates to see matching Kazi jobs, apply, and follow each application live, in order to turn a certificate into work (served by U1 to U6). |
| G4 | The Ujuzi website needs centre staff to create and edit courses and issue certificates, in order that the catalogue and certificate checks stay accurate. |
| G5 | The Ujuzi website needs centre staff to see group bookings and confirm or decline them, in order that organisers learn whether their crew training will happen. |

## Check against the Week 1 audit (Week 2, Part E)

| Need | Maps to audit item |
|---|---|
| S1 | Courses: list, filter, view one |
| S2 | Certificates: check validity |
| S3, S4, S5 | Group bookings |
| U1 to U6 | Job applications |
| G1 to G5 | Users, courses, enrolments, certificates, group bookings, job applications |

Gaps flagged: TODO after the interviews. Audit items with no partner need: centres and enrolments are internal to Ujuzi.

## Reflection

TODO after the interviews: one honest paragraph on what surprised the team. Likely material: Kazi jobs carry no employer name, and Kazi has no way to list one student's applications without a Kazi login, so Ujuzi must store every applicationId it creates. Sherehe expected a list of graduates with phone numbers, which Ujuzi will not share.
