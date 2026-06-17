-- event_attendance_ledger.eventId should cascade when an event is deleted.
-- Some environments were bootstrapped from db.sql without ON DELETE CASCADE.

ALTER TABLE event_attendance_ledger
  DROP CONSTRAINT IF EXISTS event_attendance_ledger_eventId_fkey;

ALTER TABLE event_attendance_ledger
  ADD CONSTRAINT event_attendance_ledger_eventId_fkey
  FOREIGN KEY ("eventId") REFERENCES events(id) ON DELETE CASCADE;
