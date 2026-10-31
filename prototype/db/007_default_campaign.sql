-- Default Temporal Loom campaign.
-- Apply after 006_customer_accounts.sql:
--   psql "$env:DATABASE_URL" -f db/007_default_campaign.sql
--
-- The rewards game needs an active campaign to be playable. This seeds one so
-- anyone can play and earn out of the box, with no account, ticket or payment.
-- Operators can edit or replace it from the Command Deck; the insert only runs
-- when no other campaign is active, so it never overrides an operator's one.

INSERT INTO reward_campaigns (
  id, name, status, reward_kind, discount_percent,
  required_plays, completion_window_days, reward_expiry_days, reward_cap, instructions
)
SELECT
  '77777777-7777-4777-8777-777777777777', 'Temporal Loom', 'active', 'discount', 30,
  3, 365, 30, 1000000,
  'Play three rounds of the Temporal Loom, then apply 30% off one ticket at checkout.'
WHERE NOT EXISTS (SELECT 1 FROM reward_campaigns WHERE status = 'active')
ON CONFLICT (id) DO NOTHING;
