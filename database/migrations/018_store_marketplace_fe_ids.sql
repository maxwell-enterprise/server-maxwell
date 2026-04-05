-- Align FE string IDs with db.sql UUID PKs (pricing_rules, discounts).

ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS "feRuleId" text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_feRuleId
  ON pricing_rules ("feRuleId");

ALTER TABLE discounts ADD COLUMN IF NOT EXISTS "feId" text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_discounts_feId ON discounts ("feId");
