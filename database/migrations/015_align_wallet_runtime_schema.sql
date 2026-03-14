-- =============================================================================
-- MAXWELL ERP - Align Wallet Runtime Schema for Local PostgreSQL
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_entitlements (
    "userId" TEXT PRIMARY KEY,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    credits NUMERIC(18,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wallet_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT,
    "userId" TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    "expiryDate" TIMESTAMPTZ,
    "qrData" TEXT,
    status TEXT NOT NULL,
    "isTransferable" BOOLEAN NOT NULL DEFAULT FALSE,
    "sponsoredBy" TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wallet_items ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE wallet_items ADD COLUMN IF NOT EXISTS "isTransferable" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wallet_items ADD COLUMN IF NOT EXISTS "sponsoredBy" TEXT;
ALTER TABLE wallet_items ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE wallet_items ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE wallet_items ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF to_regclass('public.member_wallets') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO wallet_items (
        id,
        public_id,
        "userId",
        type,
        title,
        subtitle,
        "expiryDate",
        "qrData",
        status,
        "isTransferable",
        "sponsoredBy",
        meta,
        "createdAt",
        "updatedAt"
      )
      SELECT
        mw.id,
        CONCAT('WLT-', SUBSTRING(REPLACE(mw.id::text, '-', '') FROM 1 FOR 12)),
        mw.user_id::text,
        COALESCE(mw.metadata->>'itemType', 'TICKET'),
        COALESCE(mw.metadata->>'title', mw.notes, 'Wallet Item'),
        mw.notes,
        mw.valid_until,
        mw.unique_qr_string,
        mw.status::text,
        FALSE,
        mw.sponsor_user_id::text,
        COALESCE(mw.metadata, '{}'::jsonb) ||
          jsonb_strip_nulls(
            jsonb_build_object(
              'tagId', mw.tag_id::text,
              'initialBalance', mw.initial_balance,
              'balance', mw.balance,
              'sourceType', mw.source_type,
              'sourceTransactionId', mw.source_transaction_id::text,
              'sponsorUserId', mw.sponsor_user_id::text
            )
          ),
        COALESCE(mw.created_at, NOW()),
        COALESCE(mw.updated_at, mw.created_at, NOW())
      FROM member_wallets mw
      WHERE NOT EXISTS (
        SELECT 1
        FROM wallet_items wi
        WHERE wi.id = mw.id
      )
    $sql$;
  END IF;
END $$;

UPDATE wallet_items
SET public_id = CONCAT('WLT-', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
WHERE public_id IS NULL OR BTRIM(public_id) = '';

UPDATE wallet_items
SET meta = '{}'::jsonb
WHERE meta IS NULL;

UPDATE wallet_items
SET "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
WHERE "updatedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_items_public_id_uq
ON wallet_items(public_id)
WHERE public_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_items_qr_data_uq
ON wallet_items("qrData")
WHERE "qrData" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_items_user_id
ON wallet_items("userId");

CREATE INDEX IF NOT EXISTS idx_wallet_items_user_status
ON wallet_items("userId", status);

CREATE INDEX IF NOT EXISTS idx_wallet_items_created_at
ON wallet_items("createdAt" DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_items_meta_gin
ON wallet_items USING GIN (meta);

CREATE INDEX IF NOT EXISTS idx_wallet_items_meta_event_id
ON wallet_items ((meta ->> 'eventId'));

CREATE INDEX IF NOT EXISTS idx_wallet_items_meta_invitation_id
ON wallet_items ((meta ->> 'invitationId'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_items_invitation_event_uq
ON wallet_items ("userId", ((meta ->> 'invitationId')), ((meta ->> 'eventId')))
WHERE (meta ? 'invitationId') AND (meta ? 'eventId');

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT,
    "walletItemId" UUID NOT NULL REFERENCES wallet_items(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "amountChange" NUMERIC(18,2) NOT NULL,
    "balanceAfter" NUMERIC(18,2) NOT NULL,
    "referenceId" TEXT,
    "referenceName" TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "walletItemId" UUID;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "transactionType" TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "amountChange" NUMERIC(18,2);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "balanceAfter" NUMERIC(18,2);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "referenceId" TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS "referenceName" TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallet_transactions'
      AND column_name = 'wallet_id'
  ) THEN
    EXECUTE $sql$
      UPDATE wallet_transactions wt
      SET "walletItemId" = COALESCE(wt."walletItemId", wt.wallet_id),
          "transactionType" = COALESCE(wt."transactionType", wt.type::text),
          "amountChange" = COALESCE(wt."amountChange", wt.amount::numeric(18,2)),
          "balanceAfter" = COALESCE(wt."balanceAfter", wt.balance_after::numeric(18,2)),
          "referenceId" = COALESCE(wt."referenceId", wt.reference_id::text),
          "referenceName" = COALESCE(wt."referenceName", wt.notes),
          timestamp = COALESCE(wt.timestamp, wt.created_at, NOW())
    $sql$;
  END IF;
END $$;

UPDATE wallet_transactions wt
SET "userId" = wi."userId"
FROM wallet_items wi
WHERE wt."walletItemId" = wi.id
  AND (wt."userId" IS NULL OR BTRIM(wt."userId") = '');

UPDATE wallet_transactions
SET public_id = CONCAT('WTX-', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
WHERE public_id IS NULL OR BTRIM(public_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_public_id_uq
ON wallet_transactions(public_id)
WHERE public_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_item_id
ON wallet_transactions("walletItemId");

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id
ON wallet_transactions("userId");

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type
ON wallet_transactions("transactionType");

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_timestamp
ON wallet_transactions(timestamp DESC);

CREATE TABLE IF NOT EXISTS gift_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT,
    "sourceUserId" TEXT NOT NULL,
    "sourceUserName" TEXT NOT NULL,
    "entitlementId" UUID NOT NULL REFERENCES wallet_items(id) ON DELETE CASCADE,
    "itemName" TEXT NOT NULL,
    "targetEmail" TEXT,
    "claimToken" TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "sourceUserId" TEXT;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "sourceUserName" TEXT;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "entitlementId" UUID;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "itemName" TEXT;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "targetEmail" TEXT;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "claimToken" TEXT;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "claimedByUserId" TEXT;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMPTZ;
ALTER TABLE gift_allocations ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gift_allocations'
      AND column_name = 'token'
  ) THEN
    EXECUTE $sql$
      UPDATE gift_allocations ga
      SET "sourceUserId" = COALESCE(ga."sourceUserId", ga.sender_user_id::text),
          "sourceUserName" = COALESCE(ga."sourceUserName", ga.sender_user_id::text),
          "entitlementId" = COALESCE(ga."entitlementId", ga.wallet_item_id),
          "itemName" = COALESCE(
            ga."itemName",
            (SELECT wi.title FROM wallet_items wi WHERE wi.id = ga.wallet_item_id LIMIT 1),
            'Wallet Item'
          ),
          "targetEmail" = COALESCE(ga."targetEmail", ga.recipient_email),
          "claimToken" = COALESCE(ga."claimToken", ga.token),
          "claimedByUserId" = COALESCE(ga."claimedByUserId", ga.recipient_user_id::text),
          "claimedAt" = COALESCE(ga."claimedAt", ga.claimed_at),
          "createdAt" = COALESCE(ga."createdAt", ga.created_at, NOW())
    $sql$;
  END IF;
END $$;

UPDATE gift_allocations
SET "sourceUserName" = "sourceUserId"
WHERE ("sourceUserName" IS NULL OR BTRIM("sourceUserName") = '')
  AND "sourceUserId" IS NOT NULL;

UPDATE gift_allocations
SET "itemName" = 'Wallet Item'
WHERE "itemName" IS NULL OR BTRIM("itemName") = '';

UPDATE gift_allocations
SET "claimToken" = CONCAT('gift-', REPLACE(id::text, '-', ''))
WHERE "claimToken" IS NULL OR BTRIM("claimToken") = '';

UPDATE gift_allocations
SET "createdAt" = NOW()
WHERE "createdAt" IS NULL;

UPDATE gift_allocations
SET status = 'PENDING'
WHERE status IS NULL OR BTRIM(status) = '';

UPDATE gift_allocations
SET public_id = CONCAT('GFT-', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
WHERE public_id IS NULL OR BTRIM(public_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_allocations_public_id_uq
ON gift_allocations(public_id)
WHERE public_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_allocations_claim_token_uq
ON gift_allocations("claimToken");

CREATE INDEX IF NOT EXISTS idx_gift_allocations_source_user_id
ON gift_allocations("sourceUserId");

CREATE INDEX IF NOT EXISTS idx_gift_allocations_claimed_by_user_id
ON gift_allocations("claimedByUserId");

CREATE INDEX IF NOT EXISTS idx_gift_allocations_status
ON gift_allocations(status);

CREATE INDEX IF NOT EXISTS idx_gift_allocations_created_at
ON gift_allocations("createdAt" DESC);

CREATE TABLE IF NOT EXISTS membership_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    card_number TEXT NOT NULL UNIQUE,
    qr_string TEXT NOT NULL UNIQUE,
    membership_tier TEXT NOT NULL DEFAULT 'BRONZE',
    tier_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    is_lifetime BOOLEAN NOT NULL DEFAULT FALSE,
    card_design_template TEXT NOT NULL DEFAULT 'default',
    custom_design_url TEXT,
    total_events_attended INTEGER NOT NULL DEFAULT 0,
    total_points_earned INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE membership_cards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_membership_cards_user_id
ON membership_cards(user_id);

CREATE TABLE IF NOT EXISTS corporate_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT,
    "orgId" TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    "joinedAt" TIMESTAMPTZ,
    "lastActive" TIMESTAMPTZ
);

ALTER TABLE corporate_members ADD COLUMN IF NOT EXISTS public_id TEXT;

UPDATE corporate_members
SET public_id = CONCAT('CORP-', SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 12))
WHERE public_id IS NULL OR BTRIM(public_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_members_public_id_uq
ON corporate_members(public_id)
WHERE public_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corporate_members_org_id
ON corporate_members("orgId");

CREATE INDEX IF NOT EXISTS idx_corporate_members_email_ci
ON corporate_members(LOWER(email));
