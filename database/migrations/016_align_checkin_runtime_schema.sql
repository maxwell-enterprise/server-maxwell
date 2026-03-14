-- =============================================================================
-- MAXWELL ERP - Align Check-in Runtime Schema for Local PostgreSQL
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_attendance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "eventId" UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    "eventName" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "memberEmail" TEXT,
    "scannedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    method TEXT NOT NULL,
    "verificationCode" TEXT,
    "eventColor" TEXT,
    "gateId" TEXT,
    "sessionId" TEXT,
    "ticketTier" TEXT,
    status TEXT,
    "ticketUniqueId" TEXT,
    "scannerDevice" TEXT
);

ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "eventName" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "memberId" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "memberName" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "memberEmail" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "scannedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "verificationCode" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "eventColor" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "gateId" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "ticketTier" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "ticketUniqueId" TEXT;
ALTER TABLE event_attendance_ledger ADD COLUMN IF NOT EXISTS "scannerDevice" TEXT;

CREATE INDEX IF NOT EXISTS idx_event_attendance_ledger_event_id
ON event_attendance_ledger("eventId");

CREATE INDEX IF NOT EXISTS idx_event_attendance_ledger_member_id
ON event_attendance_ledger("memberId");

CREATE INDEX IF NOT EXISTS idx_event_attendance_ledger_scanned_at
ON event_attendance_ledger("scannedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_event_attendance_ledger_gate_id
ON event_attendance_ledger("gateId");

CREATE INDEX IF NOT EXISTS idx_event_attendance_ledger_ticket_unique_id
ON event_attendance_ledger("ticketUniqueId");

CREATE TABLE IF NOT EXISTS scanner_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL,
    assigned_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    assigned_gate_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE scanner_devices ADD COLUMN IF NOT EXISTS device_name TEXT;
ALTER TABLE scanner_devices ADD COLUMN IF NOT EXISTS assigned_event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE scanner_devices ADD COLUMN IF NOT EXISTS assigned_gate_id TEXT;
ALTER TABLE scanner_devices ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE scanner_devices ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;
ALTER TABLE scanner_devices ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_scanner_devices_assigned_event_id
ON scanner_devices(assigned_event_id);

CREATE INDEX IF NOT EXISTS idx_scanner_devices_is_active
ON scanner_devices(is_active);

CREATE TABLE IF NOT EXISTS offline_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_SYNC',
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE offline_sync_queue ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE offline_sync_queue ADD COLUMN IF NOT EXISTS action_type TEXT;
ALTER TABLE offline_sync_queue ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE offline_sync_queue ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING_SYNC';
ALTER TABLE offline_sync_queue ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offline_sync_queue ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_device_id
ON offline_sync_queue(device_id);

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_status
ON offline_sync_queue(status);
