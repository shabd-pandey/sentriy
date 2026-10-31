-- Customer account preferences and reward-aware checkout.
-- Apply after 005_screenings_updated_at.sql:
--   psql "$env:DATABASE_URL" -f db/006_customer_accounts.sql
--
-- The customer app used to keep settings, rewards and "tickets" in local
-- storage. Everything that belongs to an account now lives here so the
-- prototype and the deployed app show the same truth.

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id text PRIMARY KEY,
  display_name text NOT NULL DEFAULT 'Member' CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  share_watched boolean NOT NULL DEFAULT false,
  share_streak boolean NOT NULL DEFAULT false,
  product_updates boolean NOT NULL DEFAULT false,
  reminder_notifications boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A reward is selected during the hold and consumed when the booking is
-- confirmed. Store the link on both rows so an expired hold releases it and a
-- confirmed booking can be audited against the grant it used.
ALTER TABLE booking_holds
  ADD COLUMN IF NOT EXISTS reward_grant_id uuid REFERENCES reward_grants(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reward_grant_id uuid REFERENCES reward_grants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_minor integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0);

CREATE INDEX IF NOT EXISTS reward_grants_user_idx ON reward_grants (user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS campaign_enrollments_user_idx ON campaign_enrollments (user_id, status);
