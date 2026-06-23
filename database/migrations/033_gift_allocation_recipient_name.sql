-- Persist recipient display name on gift allocations (survives wallet meta cleanup on revoke)
ALTER TABLE gift_allocations
ADD COLUMN IF NOT EXISTS "recipientName" TEXT;

UPDATE gift_allocations ga
SET "recipientName" = wi.meta->>'recipientName'
FROM wallet_items wi
WHERE ga."entitlementId" = wi.id
  AND (ga."recipientName" IS NULL OR btrim(ga."recipientName") = '')
  AND wi.meta ? 'recipientName'
  AND btrim(wi.meta->>'recipientName') <> '';
