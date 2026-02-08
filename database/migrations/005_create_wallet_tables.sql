-- =============================================================================
-- MAXWELL ERP - Member Wallet & Entitlement Tables (The User's Keys)
-- =============================================================================
-- Tabel untuk menyimpan aset digital milik user

-- -----------------------------------------------------------------------------
-- A. MEMBER WALLETS (Inventaris User)
-- -----------------------------------------------------------------------------

-- Wallet Items = Tiket/Kredit yang dimiliki user
CREATE TABLE member_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Owner
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Tag yang dimiliki (The Key)
    tag_id UUID REFERENCES master_access_tags(id),
    
    -- Balance (untuk CONSUMABLE tags)
    initial_balance INTEGER NOT NULL DEFAULT 1, -- Saldo awal saat dapat
    balance INTEGER NOT NULL DEFAULT 1, -- Sisa saldo/kuota
    
    -- Status
    status wallet_item_status DEFAULT 'ACTIVE',
    
    -- QR Code untuk scan
    unique_qr_string VARCHAR(100) UNIQUE NOT NULL,
    qr_generated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Validity
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Source (darimana dapat)
    source_type VARCHAR(50) NOT NULL, -- 'PURCHASE', 'TRANSFER', 'GIFT', 'ADMIN', 'PROMO'
    source_transaction_id UUID, -- Reference ke transactions
    
    -- Sponsor & Beneficiary tracking
    sponsor_user_id UUID REFERENCES users(id), -- Siapa yang bayar aslinya
    is_gift BOOLEAN DEFAULT false,
    
    -- Lock info (saat sedang di-transfer)
    locked_at TIMESTAMPTZ,
    locked_reason VARCHAR(100),
    
    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_wallets_user ON member_wallets(user_id);
CREATE INDEX idx_wallets_tag ON member_wallets(tag_id);
CREATE INDEX idx_wallets_status ON member_wallets(status);
CREATE INDEX idx_wallets_qr ON member_wallets(unique_qr_string);
CREATE INDEX idx_wallets_valid ON member_wallets(valid_from, valid_until);
CREATE INDEX idx_wallets_user_active ON member_wallets(user_id, status) WHERE status = 'ACTIVE';

-- -----------------------------------------------------------------------------
-- B. WALLET TRANSACTIONS (Audit Log)
-- -----------------------------------------------------------------------------

-- Log setiap perubahan saldo wallet
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    wallet_id UUID REFERENCES member_wallets(id) ON DELETE CASCADE,
    
    -- Type of transaction
    type wallet_transaction_type NOT NULL,
    
    -- Amount changed (positive = add, negative = subtract)
    amount INTEGER NOT NULL,
    balance_before INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    
    -- Reference to what caused this
    reference_type VARCHAR(50), -- 'TRANSACTION', 'CHECKIN', 'TRANSFER', 'MANUAL'
    reference_id UUID,
    
    -- Additional context
    event_id UUID REFERENCES master_events(id), -- Kalau USAGE, di event mana
    related_user_id UUID REFERENCES users(id), -- Kalau TRANSFER, ke/dari siapa
    
    notes TEXT,
    performed_by UUID REFERENCES users(id), -- Siapa yang memproses
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_tx_type ON wallet_transactions(type);
CREATE INDEX idx_wallet_tx_date ON wallet_transactions(created_at);
CREATE INDEX idx_wallet_tx_reference ON wallet_transactions(reference_type, reference_id);

-- -----------------------------------------------------------------------------
-- C. GIFT ALLOCATIONS (Transfer/Sharing Tiket)
-- -----------------------------------------------------------------------------

CREATE TABLE gift_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Magic Link Token
    token VARCHAR(100) UNIQUE NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    
    -- Sender
    sender_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Wallet item yang dikirim
    wallet_item_id UUID REFERENCES member_wallets(id) ON DELETE CASCADE,
    
    -- Amount to transfer (untuk partial transfer)
    transfer_amount INTEGER NOT NULL DEFAULT 1,
    
    -- Recipient (optional, bisa diisi nanti)
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(20),
    recipient_user_id UUID REFERENCES users(id), -- Diisi setelah claim
    
    -- Delivery Method
    delivery_method gift_delivery_method NOT NULL,
    delivery_sent_at TIMESTAMPTZ,
    
    -- Custom Message
    gift_message TEXT,
    
    -- Status
    status gift_status DEFAULT 'PENDING',
    
    -- Timestamps
    claimed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gifts_token ON gift_allocations(token);
CREATE INDEX idx_gifts_sender ON gift_allocations(sender_user_id);
CREATE INDEX idx_gifts_recipient ON gift_allocations(recipient_user_id);
CREATE INDEX idx_gifts_wallet ON gift_allocations(wallet_item_id);
CREATE INDEX idx_gifts_status ON gift_allocations(status);
CREATE INDEX idx_gifts_pending ON gift_allocations(status, token_expires_at) WHERE status = 'PENDING';

-- -----------------------------------------------------------------------------
-- D. MEMBERSHIP CARDS (Digital Card)
-- -----------------------------------------------------------------------------

CREATE TABLE membership_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    -- Card Number (untuk display)
    card_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- QR Code (sama dengan wallet QR bisa, atau berbeda)
    qr_string VARCHAR(100) UNIQUE NOT NULL,
    
    -- Level & Tier
    membership_tier VARCHAR(50) DEFAULT 'BRONZE', -- BRONZE, SILVER, GOLD, PLATINUM
    tier_updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Valid Period
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    is_lifetime BOOLEAN DEFAULT false,
    
    -- Card Design
    card_design_template VARCHAR(50) DEFAULT 'default',
    custom_design_url TEXT,
    
    -- Stats (denormalized for quick access)
    total_events_attended INTEGER DEFAULT 0,
    total_points_earned INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cards_user ON membership_cards(user_id);
CREATE INDEX idx_cards_number ON membership_cards(card_number);
CREATE INDEX idx_cards_qr ON membership_cards(qr_string);
