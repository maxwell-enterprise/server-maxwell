-- =============================================================================
-- MAXWELL ERP - Check-in & Event Operations Tables
-- =============================================================================

-- Check-in Records
CREATE TABLE checkin_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES master_events(id) ON DELETE CASCADE,
    tier_id UUID REFERENCES event_tiers(id),
    gate_id UUID REFERENCES event_gates(id),
    user_id UUID REFERENCES users(id),
    wallet_id UUID REFERENCES member_wallets(id),
    tag_id UUID REFERENCES master_access_tags(id),
    scanned_qr_string VARCHAR(100) NOT NULL,
    status checkin_status NOT NULL,
    rejection_reason TEXT,
    credits_used INTEGER DEFAULT 0,
    checked_in_at TIMESTAMPTZ DEFAULT NOW(),
    checked_out_at TIMESTAMPTZ,
    scanner_device_id VARCHAR(100),
    scanned_by_user_id UUID REFERENCES users(id),
    is_offline_entry BOOLEAN DEFAULT false,
    sync_status sync_status DEFAULT 'SYNCED',
    synced_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_checkin_event ON checkin_records(event_id);
CREATE INDEX idx_checkin_user ON checkin_records(user_id);
CREATE INDEX idx_checkin_date ON checkin_records(checked_in_at);

-- Scanner Devices
CREATE TABLE scanner_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) UNIQUE NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    assigned_event_id UUID REFERENCES master_events(id),
    assigned_gate_id UUID REFERENCES event_gates(id),
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Offline Sync Queue
CREATE TABLE offline_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status sync_status DEFAULT 'PENDING_SYNC',
    attempts INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event Attendance Summary
CREATE TABLE event_attendance_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES master_events(id) ON DELETE CASCADE UNIQUE,
    total_registered INTEGER DEFAULT 0,
    total_checked_in INTEGER DEFAULT 0,
    attendance_by_tier JSONB DEFAULT '{}',
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);
