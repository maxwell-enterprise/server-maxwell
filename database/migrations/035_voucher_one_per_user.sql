-- Enforce at most one redemption per (discount code, user) when userId is known.
-- Complements application checks in workspace-identity + transactions checkout.

CREATE UNIQUE INDEX IF NOT EXISTS uq_discount_redemption_logs_user_code
  ON discount_redemption_logs (upper("discountCode"), "userId")
  WHERE "userId" IS NOT NULL AND "discountCode" IS NOT NULL;
