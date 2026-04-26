-- Ticket sharing runtime support for wallet gift flows.

ALTER TABLE gift_allocations
ADD COLUMN IF NOT EXISTS "recipientPhone" TEXT;

ALTER TABLE gift_allocations
ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMPTZ;

ALTER TABLE gift_allocations
ADD COLUMN IF NOT EXISTS "deliveryMethod" TEXT;

ALTER TABLE gift_allocations
ADD COLUMN IF NOT EXISTS "giftMessage" TEXT;

ALTER TABLE gift_allocations
ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMPTZ;

ALTER TABLE gift_allocations
ADD COLUMN IF NOT EXISTS "revokeReason" TEXT;

UPDATE gift_allocations
SET "tokenExpiresAt" = COALESCE("tokenExpiresAt", "createdAt" + INTERVAL '7 days')
WHERE "tokenExpiresAt" IS NULL;

UPDATE gift_allocations
SET "deliveryMethod" = COALESCE(NULLIF(BTRIM("deliveryMethod"), ''), 'EMAIL')
WHERE "deliveryMethod" IS NULL OR BTRIM("deliveryMethod") = '';

CREATE INDEX IF NOT EXISTS idx_gift_allocations_token_expires_at
ON gift_allocations("tokenExpiresAt");
