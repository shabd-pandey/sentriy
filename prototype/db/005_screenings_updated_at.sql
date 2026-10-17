-- Screening edit/cancel audit timestamp.
-- Apply after 004_admin_full_access.sql:
--   psql "$env:DATABASE_URL" -f db/005_screenings_updated_at.sql
--
-- The worker writes screenings.updated_at on every edit and cancel
-- (functions/api/[[path]].ts), matching catalog_titles/banners, but the column
-- was never added to the table, so screening updates failed at runtime.

ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
