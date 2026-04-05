-- Preserve FE string IDs (e.g. INV-TRX-*) alongside UUID PK.

ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS "feId" text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_transactions_feId
  ON inventory_transactions ("feId");
