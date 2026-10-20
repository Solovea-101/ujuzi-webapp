# Team Charter: Ujuzi

## Team

- Team name: Ujuzi
- TODO (name): API Lead
- TODO (name): Backend Dev
- TODO (name): Integration/QA Lead
- TODO (name): Docs/DevOps Lead

Roles rotate every 4 weeks, as the Week 1 handout says.

## App summary

Ujuzi is a skills-training app for young people in Kenya. Training centres list short courses such as catering, housekeeping, electrical work, plumbing and security, modelled on county TVET centres and NITA-graded certificates. Graduates enrol, earn certificates, see live Kazi Connect jobs that match their skill near where they live, and apply for them from Ujuzi, following each application's status live. Centre staff confirm group training bookings that event organisers make through Sherehe, and issue certificates that organisers can check. It is built with Next.js, TypeScript, PostgreSQL and Tailwind CSS.

## Resource and action audit

Every thing the app stores, and every action a user can take on it (Week 1, Part B).

### Users (graduates and centre staff)
- Register, log in, log out
- View their own profile

### Centres
- List centres and the county and area each is in

### Courses
- List courses, filter by category and county
- View one course: centre, duration, fee, next start, certificate level
- Staff create and edit courses

### Enrolments
- A graduate enrols in a course
- A graduate lists their enrolments

### Certificates
- Staff issue a certificate when a graduate completes a course
- Anyone with a certificate number checks whether it is valid
- Staff revoke a certificate

### Group bookings (made by event organisers through Sherehe)
- Create a booking for a crew
- View a booking and its status
- Change the crew size or start date, or cancel, while pending
- Staff confirm or decline a booking

### Job applications (made at Kazi Connect for graduates)
- See Kazi jobs that match a course's category in the graduate's county
- Apply for a job on the graduate's behalf
- Follow the application's status live
- Reschedule or withdraw a pending application

## Ring position

- Upstream provider (we consume their API): Kazi Connect
- Downstream consumer (consumes our API): Sherehe
- The full ring: Sherehe -> Kazi Connect -> Ujuzi -> Sherehe

## Stack

Next.js (App Router) with TypeScript for the website and the API, PostgreSQL for data, Tailwind CSS v4 for styling, Jest and Supertest for tests, hosted on Render.
