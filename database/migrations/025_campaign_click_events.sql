-- Campaign click event log for lightweight dedupe and traffic forensics.
-- Keeps source-of-truth in Postgres/NestJS without adding Redis.

CREATE TABLE IF NOT EXISTS campaign_click_events (
  id uuid PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source_code text NOT NULL,
  click_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_click_events_campaign_created
  ON campaign_click_events (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_click_events_fingerprint_created
  ON campaign_click_events (click_fingerprint, created_at DESC);
