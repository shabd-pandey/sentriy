-- Shared ticket/check-in contract for the customer app (prototype),
-- the Command Deck (admin), and the Flutter door-staff app.
-- Apply after 001_catalog.sql and 002_admin.sql.
--
--   psql "$env:DATABASE_URL" -f db/001_catalog.sql
--   psql "$env:DATABASE_URL" -f db/002_admin.sql
--   psql "$env:DATABASE_URL" -f db/003_tickets.sql

-- Every confirmed booking carries a short human-typable order code
-- (printed under the QR) plus the full QR payload. Door staff accept
-- either form: "MSY-XXXX-XXXX" or "marvelsyllabus://ticket/MSY-XXXX-XXXX".
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS order_code text,
  ADD COLUMN IF NOT EXISTS qr_value text,
  ADD COLUMN IF NOT EXISTS ticket_status text NOT NULL DEFAULT 'valid'
    CHECK (ticket_status IN ('valid', 'used', 'invalid')),
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill legacy rows that predate order codes (keeps pilot data usable).
UPDATE bookings
SET
  order_code = 'MSY-' || upper(substr(md5(id::text), 1, 4)) || '-' || upper(substr(md5(id::text), 5, 4)),
  qr_value = 'marvelsyllabus://ticket/MSY-' || upper(substr(md5(id::text), 1, 4)) || '-' || upper(substr(md5(id::text), 5, 4))
WHERE order_code IS NULL OR qr_value IS NULL;

ALTER TABLE bookings ALTER COLUMN order_code SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN qr_value SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_order_code_idx ON bookings (order_code);

-- One-time check-in is enforced by ticket_status, this log is the audit trail
-- the admin reconciles against (who scanned what, when, with what result).
CREATE TABLE IF NOT EXISTS ticket_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  screening_id uuid NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
  staff_sub text NOT NULL,
  result text NOT NULL CHECK (result IN ('accepted', 'already_used', 'invalid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_checkins_screening_idx
  ON ticket_checkins (screening_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ticket_checkins_booking_idx
  ON ticket_checkins (booking_id, created_at DESC);

-- Live door counts for staff + admin (sold vs checked-in per screening).
CREATE OR REPLACE VIEW screening_door_counts AS
SELECT
  s.id AS screening_id,
  COALESCE((
    SELECT sum(b.quantity)::integer FROM bookings b
    WHERE b.screening_id = s.id AND b.status = 'confirmed'
  ), 0) AS confirmed_tickets,
  COALESCE((
    SELECT count(*)::integer FROM bookings b
    WHERE b.screening_id = s.id AND b.status = 'confirmed' AND b.ticket_status = 'used'
  ), 0) AS checked_in_bookings;
