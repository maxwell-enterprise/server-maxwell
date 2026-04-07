CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feId" text UNIQUE NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_updated_at
  ON support_tickets ("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets ((payload->>'status'));

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_role
  ON support_tickets ((payload->>'assignedRole'));
