-- Realtime voucher usage tracking, any-path: a Postgres trigger increments
-- discounts.currentUsageCount / currentBudgetBurned whenever a payment row flips to PAID,
-- regardless of who flipped it (Nest service, manual SQL, migration, admin tooling).
--
-- Combined with Supabase Realtime `postgres_changes` subscriptions on the FE, this guarantees:
--   1. usage is recorded for EVERY path that produces a PAID transaction
--   2. all subscribers see the new counters in under ~200ms via WebSocket
--
-- Idempotent vs. the Nest service path: the unique index uq_discount_redemption_logs_order_discount
-- guarantees only the first INSERT (Nest OR trigger) wins; the second is a no-op, so the discounts
-- row is never double-incremented.
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
  -- Only fire on the moment a row transitions to PAID.
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

  -- Try to record the redemption log. ON CONFLICT covers the case where Nest already wrote it.
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

  -- Only increment the counter when WE actually inserted the log row (i.e. nobody else did first).
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

DROP TRIGGER IF EXISTS apply_voucher_usage_on_paid ON payment_transactions;

CREATE TRIGGER apply_voucher_usage_on_paid
AFTER UPDATE OF status ON payment_transactions
FOR EACH ROW
EXECUTE FUNCTION apply_voucher_usage_on_paid();

COMMENT ON FUNCTION apply_voucher_usage_on_paid IS
  'Increment discounts.currentUsageCount/currentBudgetBurned when payment_transactions.status flips to PAID. Idempotent via uq_discount_redemption_logs_order_discount. See migration 033.';

-- Ensure Realtime replication is enabled for tables we expect to broadcast WebSocket changes on.
-- Supabase pre-creates supabase_realtime publication; ALTER ADD is idempotent (errors if already added,
-- so we guard with EXCEPTION handling).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE discounts;
    EXCEPTION WHEN duplicate_object THEN
      -- already member; ignore
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE discount_redemption_logs;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
