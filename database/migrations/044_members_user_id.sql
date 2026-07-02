-- Link CRM members to workspace User accounts (one User -> one linked member).

ALTER TABLE members ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Backfill: link by email (most recently updated member per User).
WITH ranked AS (
  SELECT
    m.id AS member_id,
    u.id AS workspace_user_id,
    row_number() OVER (
      PARTITION BY u.id
      ORDER BY m."updatedAt" DESC NULLS LAST, m."createdAt" DESC NULLS LAST
    ) AS rn
  FROM members m
  INNER JOIN "User" u
    ON lower(trim(m.email)) = lower(trim(u.email))
  WHERE u.email IS NOT NULL
    AND btrim(u.email) <> ''
    AND m.user_id IS NULL
)
UPDATE members m
SET user_id = ranked.workspace_user_id
FROM ranked
WHERE m.id = ranked.member_id
  AND ranked.rn = 1;

-- Keep at most one member row per workspace user before unique index.
WITH dup AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST
    ) AS rn
  FROM members
  WHERE user_id IS NOT NULL
)
UPDATE members m
SET user_id = NULL
FROM dup
WHERE m.id = dup.id
  AND dup.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'members_user_id_fkey'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "User"(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_user_id
  ON members (user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_members_user_id
  ON members (user_id)
  WHERE user_id IS NOT NULL;
