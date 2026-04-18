-- Checkout wallet grant runs on the server; optional buyer id + idempotency flags.

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS "buyerUserId" text;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS "entitlementProcessed" boolean NOT NULL DEFAULT false;

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS "entitlementProcessedAt" timestamptz;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_entitlement_pending
  ON payment_transactions (id)
  WHERE upper(status) = 'PAID' AND coalesce("entitlementProcessed", false) = false;
