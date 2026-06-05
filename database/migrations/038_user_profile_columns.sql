-- =============================================================================
-- MAXWELL ERP - Extended User profile columns (lead / account fields)
-- Run on Supabase after Prisma "User" table exists.
-- =============================================================================

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS domicile TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;

-- Backfill phone from legacy abacContext.selfProfile.phone
UPDATE "User" u
SET phone = nullif(btrim(abac.phone), '')
FROM (
  SELECT
    id,
    "abacContext" #>> '{selfProfile,phone}' AS phone
  FROM "User"
) abac
WHERE u.id = abac.id
  AND (u.phone IS NULL OR btrim(u.phone) = '')
  AND abac.phone IS NOT NULL
  AND btrim(abac.phone) <> '';
