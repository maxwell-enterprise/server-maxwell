-- =============================================================================
-- MAXWELL ERP - Align Runtime Events Schema and Invitations
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    "endDate" DATE,
    time TEXT,
    location TEXT NOT NULL,
    "locationMode" TEXT NOT NULL DEFAULT 'OFFLINE',
    "onlineMeetingLink" TEXT,
    "locationMapLink" TEXT,
    banner_url TEXT,
    description TEXT,
    capacity INTEGER NOT NULL DEFAULT 0,
    attendees INTEGER NOT NULL DEFAULT 0,
    revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Upcoming',
    "isVisibleInCatalog" BOOLEAN DEFAULT false,
    type TEXT NOT NULL,
    "parentEventId" UUID REFERENCES events(id),
    "classId" TEXT,
    "admissionPolicy" TEXT NOT NULL DEFAULT 'PRE_BOOKED',
    "creditTags" TEXT[] NOT NULL DEFAULT '{}',
    "doneTag" TEXT,
    "isRecurring" BOOLEAN DEFAULT false,
    "recurringMeta" JSONB,
    "selectionConfig" JSONB,
    gates JSONB,
    tiers JSONB,
    sessions JSONB,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'TBD';
ALTER TABLE events ADD COLUMN IF NOT EXISTS "locationMode" TEXT NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS attendees INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS revenue NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Upcoming';
ALTER TABLE events ADD COLUMN IF NOT EXISTS "isVisibleInCatalog" BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "admissionPolicy" TEXT NOT NULL DEFAULT 'PRE_BOOKED';
ALTER TABLE events ADD COLUMN IF NOT EXISTS "creditTags" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE events ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

UPDATE events
SET public_id = concat('EVT-', substring(replace(id::text, '-', '') from 1 for 12))
WHERE public_id IS NULL OR btrim(public_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_public_id_uq
ON events(public_id)
WHERE public_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT,
    "eventId" UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    "eventName" TEXT NOT NULL,
    "tierId" TEXT,
    "tierName" TEXT,
    "memberId" UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    "memberName" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    "validUntil" TIMESTAMPTZ NOT NULL,
    "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "sentBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS "tierId" TEXT;
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS "tierName" TEXT;
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE event_invitations
SET public_id = concat('INV-', substring(replace(id::text, '-', '') from 1 for 12))
WHERE public_id IS NULL OR btrim(public_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_invitations_public_id_uq
ON event_invitations(public_id)
WHERE public_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_invitations_event_id
ON event_invitations("eventId");

CREATE INDEX IF NOT EXISTS idx_event_invitations_member_id
ON event_invitations("memberId");

CREATE INDEX IF NOT EXISTS idx_event_invitations_status
ON event_invitations(status);

CREATE INDEX IF NOT EXISTS idx_event_invitations_valid_until
ON event_invitations("validUntil");
