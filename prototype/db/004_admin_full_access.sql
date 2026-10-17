-- Full-access admin: booking/hold/check-in management + extended audit categories.
-- Apply after 003_tickets.sql:
--   psql "$env:DATABASE_URL" -f db/004_admin_full_access.sql

-- Allow audit entries for ticketing operations. Existing rows keep their
-- six original categories; new categories cover operator actions on
-- bookings, holds, tickets/check-ins, and data imports.
ALTER TABLE admin_activity DROP CONSTRAINT IF EXISTS admin_activity_category_check;
ALTER TABLE admin_activity ADD CONSTRAINT admin_activity_category_check
  CHECK (category IN ('catalog', 'screening', 'artwork', 'settings', 'banner', 'reward', 'booking', 'ticket', 'system'));

-- Helpful indexes for the Command Deck bookings/doors views.
CREATE INDEX IF NOT EXISTS bookings_screening_idx ON bookings (screening_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_holds_screening_idx ON booking_holds (screening_id, expires_at DESC);
