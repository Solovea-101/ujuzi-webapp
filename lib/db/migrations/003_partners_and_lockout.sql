-- Each booking belongs to the partner whose key created it, so one partner cannot read or change another's.
-- Every booking so far was made by Sherehe, the only partner, so that is who the existing rows belong to.
ALTER TABLE bookings ADD COLUMN partner text NOT NULL DEFAULT 'sherehe';
ALTER TABLE bookings ALTER COLUMN partner DROP DEFAULT;

-- The duplicate rule now applies within one partner: two partners may each have a pending booking for the same event.
DROP INDEX bookings_pending_event_key;
CREATE UNIQUE INDEX bookings_pending_event_key
  ON bookings (partner, course_id, lower(event_name))
  WHERE status = 'pending';

-- Failed sign-ins per email address (lower case), whether or not an account exists, so a lock reveals nothing about
-- which emails are registered. Kept in the database so a restart, or a second server, does not reset it.
CREATE TABLE sign_in_failures (
  email_key       text PRIMARY KEY,
  failures        integer NOT NULL,
  last_failure_at timestamptz NOT NULL,
  locked_until    timestamptz
);
