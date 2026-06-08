-- =============================================================================
-- MAXWELL ERP - Members profile columns (parity with User / Account Settings)
-- Run on Supabase after 013 + 038.
-- phone, company, jobTitle, linkedinUrl already exist on members (013).
-- =============================================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS domicile TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS instagram TEXT;

-- Backfill domicile from legacy address JSON
UPDATE members m
SET domicile = nullif(btrim(m.address #>> '{city}'), '')
WHERE (m.domicile IS NULL OR btrim(m.domicile) = '')
  AND m.address IS NOT NULL
  AND nullif(btrim(m.address #>> '{city}'), '') IS NOT NULL;

-- Backfill instagram from legacy socialProfile JSON
UPDATE members m
SET instagram = nullif(btrim(m."socialProfile" #>> '{instagram}'), '')
WHERE (m.instagram IS NULL OR btrim(m.instagram) = '')
  AND m."socialProfile" IS NOT NULL
  AND nullif(btrim(m."socialProfile" #>> '{instagram}'), '') IS NOT NULL;
