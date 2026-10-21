-- One pending booking per course and event name (ignoring case): a second POST for the same event
-- is a 409, and this index makes that hold even when two requests arrive at the same moment.
-- Confirmed and declined bookings are not counted, so an event can be booked again after a decision.
CREATE UNIQUE INDEX bookings_pending_event_key
  ON bookings (course_id, lower(event_name))
  WHERE status = 'pending';
