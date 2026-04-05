-- Master Commission Rules (maxwell-refactor CommissionRule). Separate from legacy migration 006 `commission_rules`.
-- Nest `/fe/commission-rules` reads/writes this table only.

CREATE TABLE IF NOT EXISTS fe_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "feId" text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  "targetProductId" text NOT NULL DEFAULT 'ALL',
  "beneficiaryRole" text NOT NULL DEFAULT 'ALL',
  "beneficiaryBasis" text NOT NULL,
  type text NOT NULL,
  value numeric(18, 2) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fe_commission_rules_active ON fe_commission_rules ("isActive");
