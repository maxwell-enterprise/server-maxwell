-- =============================================================================
-- MAXWELL ERP - Core Tables (Users, Events, Access Tags)
-- =============================================================================
-- Tabel-tabel inti sistem: Users, Events, dan Access Tags (The Lock & Key)

-- -----------------------------------------------------------------------------
-- A. USER & MEMBER TABLES
-- -----------------------------------------------------------------------------

-- Tabel utama users (Auth & Identity)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Authentication
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255), -- NULL jika pakai OAuth
    
    -- Profile
    full_name VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    avatar_url TEXT,
    date_of_birth DATE,
    gender VARCHAR(20),
    
    -- Identity Document
    identity_type identity_type,
    identity_number VARCHAR(100),
    
    -- Role & Status
    role user_role DEFAULT 'GUEST',
    lifecycle_stage member_lifecycle_stage DEFAULT 'GUEST',
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    phone_verified_at TIMESTAMPTZ,
    
    -- Contact & Address
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'Indonesia',
    
    -- Professional Info (for AI Scout)
    company VARCHAR(255),
    job_title VARCHAR(255),
    linkedin_url TEXT,
    industry VARCHAR(100),
    
    -- Gamification
    total_points INTEGER DEFAULT 0,
    current_level INTEGER DEFAULT 1,
    
    -- Referral & Hierarchy
    referred_by_user_id UUID REFERENCES users(id),
    facilitator_id UUID REFERENCES users(id), -- Mentor/Upline
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk pencarian user
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_lifecycle ON users(lifecycle_stage);
CREATE INDEX idx_users_facilitator ON users(facilitator_id);
CREATE INDEX idx_users_fullname_trgm ON users USING gin(full_name gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- B. MASTER EVENTS (The Lock/Gembok)
-- -----------------------------------------------------------------------------

-- Event utama
CREATE TABLE master_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    
    -- Type & Hierarchy
    type event_type NOT NULL,
    parent_event_id UUID REFERENCES master_events(id), -- Untuk CLASS -> SERIES
    
    -- Schedule
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
    
    -- Recurring Pattern (untuk RECURRING type)
    recurring_pattern recurring_pattern,
    recurring_end_date DATE,
    recurring_exceptions JSONB DEFAULT '[]', -- Tanggal yang di-skip
    
    -- Location
    location_name VARCHAR(255),
    location_address TEXT,
    location_city VARCHAR(100),
    location_maps_url TEXT,
    is_online BOOLEAN DEFAULT false,
    online_meeting_url TEXT,
    
    -- Capacity
    total_capacity INTEGER,
    current_attendees INTEGER DEFAULT 0,
    
    -- Media
    banner_url TEXT,
    thumbnail_url TEXT,
    gallery_urls JSONB DEFAULT '[]',
    
    -- Status & Visibility
    status event_status DEFAULT 'DRAFT',
    is_public BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    
    -- Registration Settings
    registration_start_at TIMESTAMPTZ,
    registration_end_at TIMESTAMPTZ,
    
    -- Metadata
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk event queries
CREATE INDEX idx_events_type ON master_events(type);
CREATE INDEX idx_events_status ON master_events(status);
CREATE INDEX idx_events_parent ON master_events(parent_event_id);
CREATE INDEX idx_events_start_time ON master_events(start_time);
CREATE INDEX idx_events_slug ON master_events(slug);
CREATE INDEX idx_events_is_public ON master_events(is_public) WHERE is_public = true;

-- Event Tiers (VIP, Regular, General) untuk FESTIVAL
CREATE TABLE event_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES master_events(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL, -- 'VIP', 'Regular', 'General'
    description TEXT,
    capacity INTEGER,
    current_attendees INTEGER DEFAULT 0,
    
    -- Perks/Benefits
    benefits JSONB DEFAULT '[]',
    
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_tiers_event ON event_tiers(event_id);

-- Event Gates (Pintu masuk untuk FESTIVAL)
CREATE TABLE event_gates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES master_events(id) ON DELETE CASCADE,
    
    name VARCHAR(100) NOT NULL, -- 'Gate A', 'VIP Entrance'
    description TEXT,
    location_hint TEXT, -- "Dekat parkir utama"
    
    -- Tier yang boleh masuk gate ini
    allowed_tier_ids UUID[] DEFAULT '{}',
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_gates_event ON event_gates(event_id);

-- -----------------------------------------------------------------------------
-- C. MASTER ACCESS TAGS (The Key/Kunci)
-- -----------------------------------------------------------------------------

-- Definisi Tag (Kunci digital)
CREATE TABLE master_access_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    code VARCHAR(100) UNIQUE NOT NULL, -- 'VIP_2025', 'SERIES_FULL', 'WORKSHOP_SINGLE'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Usage Type
    usage_type tag_usage_type NOT NULL,
    category tag_category NOT NULL,
    
    -- Validity
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    
    -- Visual
    icon_url TEXT,
    color_hex VARCHAR(7), -- '#FF5733'
    
    -- Metadata
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tags_code ON master_access_tags(code);
CREATE INDEX idx_tags_category ON master_access_tags(category);
CREATE INDEX idx_tags_active ON master_access_tags(is_active) WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- D. EVENT ACCESS RULES (Aturan Lock & Key)
-- -----------------------------------------------------------------------------

-- Mapping: Event mana bisa dibuka oleh Tag mana
CREATE TABLE event_access_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES master_events(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES master_access_tags(id) ON DELETE CASCADE,
    
    -- Optional: Tier spesifik yang bisa diakses dengan tag ini
    tier_id UUID REFERENCES event_tiers(id) ON DELETE SET NULL,
    
    -- Usage amount per entry (untuk CONSUMABLE)
    usage_amount INTEGER DEFAULT 1, -- Berapa kredit yang dipotong
    
    -- Priority (untuk resolusi konflik)
    priority INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(event_id, tag_id, tier_id)
);

CREATE INDEX idx_access_rules_event ON event_access_rules(event_id);
CREATE INDEX idx_access_rules_tag ON event_access_rules(tag_id);

-- -----------------------------------------------------------------------------
-- E. USER SESSIONS & AUTH
-- -----------------------------------------------------------------------------

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    token_hash VARCHAR(255) NOT NULL,
    device_info JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    
    expires_at TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);

-- OAuth Connections
CREATE TABLE user_oauth_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    provider VARCHAR(50) NOT NULL, -- 'google', 'facebook', 'apple'
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    
    profile_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX idx_oauth_user ON user_oauth_connections(user_id);
CREATE INDEX idx_oauth_provider ON user_oauth_connections(provider, provider_user_id);
