-- Fix apply_voucher_usage_on_paid(): ON CONFLICT must match the partial unique index from
-- migration 032 (WHERE orderId/discountCode IS NOT NULL). Without the predicate Postgres
-- raises 42P10 and PAID updates roll back → "Internal server error" on checkout/simulate-settle.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION apply_voucher_usage_on_paid()
RETURNS TRIGGER AS $$
DECLARE
  v_code text;
  v_amount numeric;
  v_discount_id uuid;
  v_inserted integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'PAID' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(OLD.status, '') = 'PAID' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW."discountAmount", 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW."voucherCode" IS NULL OR length(trim(NEW."voucherCode")) = 0 THEN
    RETURN NEW;
  END IF;

  v_code := upper(trim(NEW."voucherCode"));
  v_amount := NEW."discountAmount";

  SELECT id INTO v_discount_id
  FROM discounts
  WHERE upper(code) = v_code
  LIMIT 1;

  IF v_discount_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO discount_redemption_logs (
    id,
    "discountId",
    "discountCode",
    "userId",
    "orderId",
    amount,
    "specificDiscount",
    metadata,
    timestamp
  ) VALUES (
    gen_random_uuid(),
    v_discount_id,
    v_code,
    NEW."buyerUserId",
    NEW."orderId",
    v_amount,
    v_amount,
    jsonb_build_object(
      'source', 'db_trigger',
      'paymentId', NEW.id::text
    ),
    now()
  )
  ON CONFLICT ("orderId", "discountCode")
    WHERE "orderId" IS NOT NULL AND "discountCode" IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    UPDATE discounts
    SET
      "currentUsageCount"   = COALESCE("currentUsageCount", 0) + 1,
      "currentBudgetBurned" = COALESCE("currentBudgetBurned", 0) + v_amount
    WHERE id = v_discount_id
      AND ("maxUsageLimit" IS NULL OR COALESCE("currentUsageCount", 0) < "maxUsageLimit")
      AND ("maxBudgetLimit" IS NULL OR COALESCE("currentBudgetBurned", 0) + v_amount <= "maxBudgetLimit");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
