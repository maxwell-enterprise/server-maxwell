-- Align legacy support_tickets (flat columns from 011/db.sql) with StoreSupportService API
-- which uses: id, "feId", payload (jsonb), "createdAt", "updatedAt".
-- Migration 025 uses CREATE TABLE IF NOT EXISTS, so an existing legacy table was never upgraded.

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "feId" text;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Legacy rows: backfill feId + payload from flat columns (only when subject column exists = old shape)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_tickets'
      AND column_name = 'subject'
  )
     AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'support_tickets'
      AND column_name = 'memberId'
  ) THEN
    UPDATE support_tickets st
    SET
      "feId" = COALESCE(NULLIF(TRIM(st."feId"), ''), st.id::text),
      payload = jsonb_strip_nulls(
        jsonb_build_object(
          'id', COALESCE(NULLIF(TRIM(st."feId"), ''), st.id::text),
          'memberId', st."memberId",
          'memberName', st."memberName",
          'subject', st.subject,
          'description', st.description,
          'priority', st.priority,
          'status', st.status,
          'assignedRole', st."assignedRole",
          'createdAt', to_char(st."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'updatedAt', to_char(st."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      )
    WHERE st.payload = '{}'::jsonb;
  END IF;
END $$;

-- Ensure feId populated for any row still missing it
UPDATE support_tickets
SET "feId" = id::text
WHERE "feId" IS NULL OR TRIM("feId") = '';

-- Unique feId required for ON CONFLICT ("feId")
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_feId_key ON support_tickets ("feId");

ALTER TABLE support_tickets
  ALTER COLUMN "feId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_updated_at
  ON support_tickets ("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets ((payload->>'status'));

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_role
  ON support_tickets ((payload->>'assignedRole'));
