-- Persist voucher code on payment rows and make voucher redemption idempotent.
--
-- Safe to re-run.

ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS "voucherCode" text;

COMMENT ON COLUMN payment_transactions."voucherCode" IS 'Applied voucher code for this checkout, if any.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_discount_redemption_logs_order_discount
  ON discount_redemption_logs ("orderId", "discountCode")
  WHERE "orderId" IS NOT NULL AND "discountCode" IS NOT NULL;
