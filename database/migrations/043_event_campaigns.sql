-- Event campaigns: targeted offers to form respondents (email match).

CREATE TABLE IF NOT EXISTS event_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE,
  name varchar(500) NOT NULL,
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE RESTRICT,
  form_title varchar(500) NOT NULL,
  target_product_id text NOT NULL,
  linked_discount_code text,
  must_be_accepted boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_campaigns_created_at
  ON event_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS event_campaign_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES event_campaigns(id) ON DELETE CASCADE,
  recipient_email varchar(255) NOT NULL,
  recipient_name varchar(255),
  user_id text,
  status text NOT NULL DEFAULT 'PENDING_LOGIN',
  dismissed_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_campaign_assignments_status_chk CHECK (
    status IN (
      'PENDING_LOGIN',
      'ACTIVE',
      'DISMISSED',
      'CONVERTED',
      'SKIPPED_HAS_TICKET'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_campaign_assignments_campaign_email
  ON event_campaign_assignments (campaign_id, recipient_email);

CREATE INDEX IF NOT EXISTS idx_event_campaign_assignments_user_status
  ON event_campaign_assignments (user_id, status)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_campaign_assignments_email_status
  ON event_campaign_assignments (lower(trim(recipient_email)), status);
