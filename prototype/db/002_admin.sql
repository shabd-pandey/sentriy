-- Admin workspace tables: promotional banners, admin activity/audit log,
-- and reward campaign configuration. Applied after 001_catalog.sql.

-- Promotional banners are independent of film posters.
CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kicker text NOT NULL DEFAULT '',
  title text NOT NULL CHECK (length(trim(title)) > 0),
  copy text NOT NULL DEFAULT '',
  image_key text,
  accent text NOT NULL DEFAULT 'teal' CHECK (accent IN ('violet', 'coral', 'teal')),
  destination_title_id text REFERENCES catalog_titles(id) ON DELETE SET NULL,
  destination_screening_id uuid REFERENCES screenings(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published')),
  publish_at timestamptz,
  unpublish_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (unpublish_at IS NULL OR publish_at IS NULL OR unpublish_at > publish_at)
);

CREATE INDEX IF NOT EXISTS banners_public_idx ON banners (state, publish_at);

-- Reward campaigns. A campaign grants exactly one configured reward kind.
-- The reward kind and reward cap are immutable after creation.
CREATE TABLE IF NOT EXISTS reward_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  reward_kind text NOT NULL CHECK (reward_kind IN ('coupon', 'discount', 'free-ticket')),
  discount_percent integer CHECK (discount_percent IN (30, 50)),
  free_ticket_screening_id uuid REFERENCES screenings(id) ON DELETE SET NULL,
  required_plays integer NOT NULL DEFAULT 3 CHECK (required_plays >= 1),
  completion_window_days integer NOT NULL DEFAULT 7 CHECK (completion_window_days >= 1),
  reward_expiry_days integer NOT NULL DEFAULT 30 CHECK (reward_expiry_days >= 1),
  reward_cap integer NOT NULL CHECK (reward_cap > 0),
  instructions text NOT NULL DEFAULT '',
  allow_overlap boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Manually entered partner coupon-code pool for coupon campaigns.
CREATE TABLE IF NOT EXISTS reward_campaign_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (length(trim(code)) > 0),
  instructions text,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'used')),
  granted_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, code)
);

CREATE INDEX IF NOT EXISTS reward_campaign_codes_campaign_idx
  ON reward_campaign_codes (campaign_id, status);

-- One enrollment per account per campaign. The customer game engine writes
-- progress/reservations here; the admin reviews them.
CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  completed_plays integer NOT NULL DEFAULT 0 CHECK (completed_plays >= 0),
  round_started_at timestamptz,
  active_round_expires_at timestamptz,
  reservation_expires_at timestamptz,
  code_id uuid REFERENCES reward_campaign_codes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'granted', 'claimed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS reward_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES reward_campaigns(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES campaign_enrollments(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'expired')),
  redeemed_at timestamptz,
  code_id uuid REFERENCES reward_campaign_codes(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reward_grants_campaign_idx ON reward_grants (campaign_id, status);
CREATE INDEX IF NOT EXISTS reward_grants_entrant_idx ON reward_grants (enrollment_id);

-- Durable activity/audit history for the admin dashboard.
CREATE TABLE IF NOT EXISTS admin_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_sub text NOT NULL,
  category text NOT NULL CHECK (category IN ('catalog', 'screening', 'artwork', 'settings', 'banner', 'reward')),
  summary text NOT NULL,
  screening_id uuid REFERENCES screenings(id) ON DELETE SET NULL,
  banner_id uuid REFERENCES banners(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES reward_campaigns(id) ON DELETE SET NULL,
  order_ref text
);

CREATE INDEX IF NOT EXISTS admin_activity_recent_idx ON admin_activity (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_activity_category_idx ON admin_activity (category, occurred_at DESC);