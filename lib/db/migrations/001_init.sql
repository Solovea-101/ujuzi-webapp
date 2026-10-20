-- Ujuzi schema, migration 001. snake_case lives here only; the API speaks camelCase (lib/mappers.ts).
--
-- IDs are text with a type prefix (crs_501). The prefix and number are built in TypeScript
-- (ID_FORMATS in lib/db/types.ts) from the sequences below, so every sequence simply starts at 1
-- and the in-memory store counts the same way.
--
-- The category and certificate-level lists below must match the shared lists in openapi.yaml.

CREATE SEQUENCE centre_seq;
CREATE SEQUENCE course_seq;
CREATE SEQUENCE graduate_seq;
CREATE SEQUENCE staff_seq;
CREATE SEQUENCE enrolment_seq;
CREATE SEQUENCE booking_seq;
CREATE SEQUENCE certificate_seq;

CREATE TABLE centres (
  id     text PRIMARY KEY,
  name   text NOT NULL,
  county text NOT NULL,
  area   text NOT NULL
);
CREATE INDEX centres_county_idx ON centres (lower(county));

CREATE TABLE courses (
  id                text PRIMARY KEY,
  centre_id         text NOT NULL REFERENCES centres (id),
  title             text NOT NULL,
  category          text NOT NULL CHECK (category IN (
                      'accommodation', 'campus', 'catering', 'cleaning', 'electrical',
                      'events', 'plumbing', 'security', 'tutoring')),
  duration_weeks    integer NOT NULL CHECK (duration_weeks >= 1),
  fee_kes           integer NOT NULL CHECK (fee_kes >= 0),
  next_start        timestamptz NOT NULL,
  certificate_level text NOT NULL CHECK (certificate_level IN (
                      'short-course', 'grade-III', 'grade-II', 'grade-I'))
);
CREATE INDEX courses_category_idx ON courses (category);
CREATE INDEX courses_centre_idx ON courses (centre_id);

-- Graduates (grd_) and centre staff (usr_). Staff belong to exactly one centre.
CREATE TABLE users (
  id            text PRIMARY KEY,
  role          text NOT NULL CHECK (role IN ('graduate', 'staff')),
  email         text NOT NULL,
  password_hash text NOT NULL,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  centre_id     text REFERENCES centres (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'staff') = (centre_id IS NOT NULL))
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Only the SHA-256 hash of a login token is stored, never the token.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE enrolments (
  id          text PRIMARY KEY,
  graduate_id text NOT NULL REFERENCES users (id),
  course_id   text NOT NULL REFERENCES courses (id),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (graduate_id, course_id)
);

-- course_title and level are copied from the course when the certificate is issued, so editing
-- the course later never changes what an old certificate says. The holder comes from the enrolment.
CREATE TABLE certificates (
  certificate_no text PRIMARY KEY CHECK (certificate_no ~ '^UJZ-[0-9]{4}-[0-9]{5}$'),
  enrolment_id   text NOT NULL UNIQUE REFERENCES enrolments (id),
  course_title   text NOT NULL,
  level          text NOT NULL CHECK (level IN ('short-course', 'grade-III', 'grade-II', 'grade-I')),
  issued_on      date NOT NULL,
  revoked_at     timestamptz
);

-- A cancelled booking is deleted, so its id then answers 404.
CREATE TABLE bookings (
  id              text PRIMARY KEY,
  course_id       text NOT NULL REFERENCES courses (id),
  event_name      text NOT NULL,
  crew_size       integer NOT NULL CHECK (crew_size BETWEEN 1 AND 40),
  preferred_start timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_course_idx ON bookings (course_id);

-- Every application Ujuzi creates at Kazi Connect, keyed by Kazi's applicationId. Kazi cannot list
-- one student's applications without a Kazi login, so this table is the only record of them.
CREATE TABLE kazi_applications (
  application_id text PRIMARY KEY,
  graduate_id    text NOT NULL REFERENCES users (id),
  job_id         text NOT NULL,
  preferred_date timestamptz NOT NULL,
  note           text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'filled', 'cancelled')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kazi_applications_graduate_idx ON kazi_applications (graduate_id);
CREATE INDEX kazi_applications_pending_idx ON kazi_applications (status) WHERE status = 'pending';
