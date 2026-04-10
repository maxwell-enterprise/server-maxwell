-- Raw click forensics (optional; analytics / abuse review). Safe to run on any env with campaign_click_events.

ALTER TABLE campaign_click_events
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text;

COMMENT ON COLUMN campaign_click_events.ip IS 'Client IP from Nest track-click (nullable)';
COMMENT ON COLUMN campaign_click_events.user_agent IS 'User-Agent from Nest track-click (nullable)';
