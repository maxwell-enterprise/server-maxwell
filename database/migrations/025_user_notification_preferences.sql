-- Per-user notification toggles (Account Settings). Keys match internal staff + CRM member string ids.
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  "userId" text PRIMARY KEY,
  "emailTransactional" boolean NOT NULL DEFAULT false,
  "emailMarketing" boolean NOT NULL DEFAULT false,
  "smsAlerts" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_updated
  ON user_notification_preferences ("updatedAt" DESC);
