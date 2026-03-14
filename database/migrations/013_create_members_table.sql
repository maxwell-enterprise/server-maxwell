-- =============================================================================
-- MAXWELL ERP - Members Table for FE CRM Contract
-- =============================================================================

CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    category TEXT,
    scholarship BOOLEAN NOT NULL DEFAULT false,
    "joinMonth" TEXT NOT NULL,
    program TEXT NOT NULL DEFAULT '',
    "mentorshipDuration" INTEGER NOT NULL DEFAULT 0,
    "nTagStatus" TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    "regInUS" BOOLEAN NOT NULL DEFAULT false,
    "lifecycleStage" TEXT NOT NULL DEFAULT 'GUEST',
    company TEXT,
    "jobTitle" TEXT,
    industry TEXT,
    tags TEXT[] DEFAULT '{}',
    address JSONB,
    "socialProfile" JSONB,
    "birthDate" DATE,
    gender TEXT,
    "linkedinUrl" TEXT,
    "serviceLevel" TEXT,
    achievements JSONB DEFAULT '[]',
    "earnedDoneTags" TEXT[] DEFAULT '{}',
    engagement JSONB,
    notes TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE members ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS scholarship BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "joinMonth" TEXT NOT NULL DEFAULT to_char(NOW(), 'YYYY-MM');
ALTER TABLE members ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS "mentorshipDuration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "nTagStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN IF NOT EXISTS "regInUS" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "lifecycleStage" TEXT NOT NULL DEFAULT 'GUEST';
ALTER TABLE members ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE members ADD COLUMN IF NOT EXISTS address JSONB;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "socialProfile" JSONB;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "birthDate" DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "serviceLevel" TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS achievements JSONB DEFAULT '[]';
ALTER TABLE members ADD COLUMN IF NOT EXISTS "earnedDoneTags" TEXT[] DEFAULT '{}';
ALTER TABLE members ADD COLUMN IF NOT EXISTS engagement JSONB;
ALTER TABLE members ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE members ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE members
SET public_id = id::text
WHERE public_id IS NULL OR btrim(public_id) = '';

ALTER TABLE members ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_public_id ON members(public_id);
CREATE INDEX IF NOT EXISTS idx_members_email_ci ON members(lower(email));
CREATE INDEX IF NOT EXISTS idx_members_join_month ON members("joinMonth");
CREATE INDEX IF NOT EXISTS idx_members_lifecycle_stage ON members("lifecycleStage");
CREATE INDEX IF NOT EXISTS idx_members_platform ON members(platform);
CREATE INDEX IF NOT EXISTS idx_members_tags_gin ON members USING GIN(tags);
