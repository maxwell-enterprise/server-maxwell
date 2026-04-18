-- Checkout wallet grant runs on the server; optional buyer id + idempotency flags.
--
-- Deploy BEFORE enabling the Nest build that inserts "buyerUserId" and runs CheckoutEntitlementsService.
-- Idempotent: safe to re-run (IF NOT EXISTS).
--
-- Legacy PAID rows (before this migration) get entitlementProcessed = false. New webhooks/simulate
-- will process them on next matching event, or run a one-off backfill calling the same service by id.
--
-- Rollback (destructive; only if needed):
--   DROP INDEX IF EXISTS idx_payment_transactions_entitlement_backfill;
--   ALTER TABLE payment_transactions DROP COLUMN IF EXISTS "entitlementProcessedAt";
--   ALTER TABLE payment_transactions DROP COLUMN IF EXISTS "entitlementProcessed";
--   ALTER TABLE payment_transactions DROP COLUMN IF EXISTS "buyerUserId";

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS "buyerUserId" text;

COMMENT ON COLUMN payment_transactions."buyerUserId" IS 'Optional JWT sub / wallet owner id when checkout used Authorization Bearer.';

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS "entitlementProcessed" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN payment_transactions."entitlementProcessed" IS 'True after server granted wallet items for this payment (idempotent).';

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS "entitlementProcessedAt" timestamptz;

-- Replaces earlier draft index name if migration was applied before this file was updated.
DROP INDEX IF EXISTS idx_payment_transactions_entitlement_pending;

-- Supports listing PAID rows still needing entitlement (support / manual backfill).
CREATE INDEX IF NOT EXISTS idx_payment_transactions_entitlement_backfill
  ON payment_transactions ("createdAt" DESC)
  WHERE upper(status) = 'PAID' AND coalesce("entitlementProcessed", false) = false;
