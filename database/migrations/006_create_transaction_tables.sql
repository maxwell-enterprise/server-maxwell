-- =============================================================================
-- MAXWELL ERP - Transaction & Finance Tables
-- =============================================================================
-- Tabel untuk transaksi pembelian dan pencatatan keuangan

-- -----------------------------------------------------------------------------
-- A. TRANSACTIONS (Header Transaksi)
-- -----------------------------------------------------------------------------

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Transaction Number (human readable)
    transaction_number VARCHAR(50) UNIQUE NOT NULL, -- INV-20260205-0001
    
    -- Buyer
    user_id UUID REFERENCES users(id),
    
    -- Guest checkout info (jika belum register)
    guest_email VARCHAR(255),
    guest_name VARCHAR(255),
    guest_phone VARCHAR(20),
    
    -- Amounts
    subtotal_amount DECIMAL(15, 2) NOT NULL,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    total_amount DECIMAL(15, 2) NOT NULL,
    
    -- Payment Info
    payment_status payment_status DEFAULT 'PENDING',
    payment_method payment_method,
    paid_amount DECIMAL(15, 2) DEFAULT 0, -- Untuk partial payment
    paid_at TIMESTAMPTZ,
    
    -- Midtrans Integration
    midtrans_order_id VARCHAR(100) UNIQUE,
    midtrans_transaction_id VARCHAR(100),
    midtrans_payment_type VARCHAR(50),
    midtrans_va_number VARCHAR(50),
    midtrans_qr_string TEXT,
    midtrans_redirect_url TEXT,
    midtrans_response JSONB DEFAULT '{}',
    
    -- Expiry
    payment_expires_at TIMESTAMPTZ,
    
    -- Voucher Applied
    voucher_id UUID REFERENCES vouchers(id),
    voucher_code VARCHAR(50),
    
    -- Transaction Type
    type transaction_type DEFAULT 'SALE',
    
    -- Related to (untuk REFUND reference)
    original_transaction_id UUID REFERENCES transactions(id),
    
    -- Processing Status
    entitlement_processed BOOLEAN DEFAULT false, -- Sudah diproses ke wallet belum
    entitlement_processed_at TIMESTAMPTZ,
    
    -- Referral/Sales tracking
    referrer_user_id UUID REFERENCES users(id), -- Siapa yang refer
    sales_user_id UUID REFERENCES users(id), -- Sales yang handle
    
    -- Notes
    internal_notes TEXT, -- Catatan internal
    customer_notes TEXT, -- Catatan dari customer
    
    -- IP & Device
    ip_address INET,
    user_agent TEXT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_number ON transactions(transaction_number);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(payment_status);
CREATE INDEX idx_transactions_midtrans ON transactions(midtrans_order_id);
CREATE INDEX idx_transactions_date ON transactions(created_at);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_pending ON transactions(payment_status, payment_expires_at) 
    WHERE payment_status = 'PENDING';

-- -----------------------------------------------------------------------------
-- B. TRANSACTION ITEMS (Detail Item per Transaksi)
-- -----------------------------------------------------------------------------

CREATE TABLE transaction_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    
    product_id UUID REFERENCES products(id),
    
    -- Snapshot data produk (biar tidak berubah kalau produk diupdate)
    product_name VARCHAR(255) NOT NULL,
    product_type product_type NOT NULL,
    
    -- Pricing
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    total_price DECIMAL(15, 2) NOT NULL,
    
    -- Pricing tier yang dipakai
    pricing_tier_id UUID REFERENCES product_pricing_tiers(id),
    pricing_tier_name VARCHAR(100),
    
    -- Entitlement yang akan diberikan
    entitlement_processed BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tx_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_tx_items_product ON transaction_items(product_id);

-- -----------------------------------------------------------------------------
-- C. PAYMENT LOGS (Webhook History)
-- -----------------------------------------------------------------------------

CREATE TABLE payment_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    
    -- Source
    source VARCHAR(50) NOT NULL, -- 'MIDTRANS_WEBHOOK', 'MANUAL', 'SYSTEM'
    
    -- Status change
    previous_status payment_status,
    new_status payment_status,
    
    -- Raw data
    raw_payload JSONB NOT NULL,
    
    -- Processing
    is_processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_logs_transaction ON payment_logs(transaction_id);
CREATE INDEX idx_payment_logs_date ON payment_logs(created_at);

-- -----------------------------------------------------------------------------
-- D. REFUNDS
-- -----------------------------------------------------------------------------

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    
    -- Refund amount
    refund_amount DECIMAL(15, 2) NOT NULL,
    
    -- Reason
    reason_code VARCHAR(50), -- 'CUSTOMER_REQUEST', 'EVENT_CANCELLED', 'DUPLICATE', etc
    reason_text TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, PROCESSED, REJECTED
    
    -- Bank details for refund
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    account_holder VARCHAR(255),
    
    -- Processing
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    
    -- Wallet items affected
    wallet_items_reverted UUID[] DEFAULT '{}',
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refunds_transaction ON refunds(transaction_id);
CREATE INDEX idx_refunds_status ON refunds(status);

-- -----------------------------------------------------------------------------
-- E. PARTIAL PAYMENTS (Installments/DP)
-- -----------------------------------------------------------------------------

CREATE TABLE partial_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    
    -- Payment sequence
    payment_sequence INTEGER NOT NULL, -- 1 = DP, 2 = Cicilan 2, dst
    
    -- Amount
    amount DECIMAL(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    
    -- Status
    status payment_status DEFAULT 'PENDING',
    paid_at TIMESTAMPTZ,
    
    -- Midtrans for this partial
    midtrans_order_id VARCHAR(100),
    midtrans_response JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_partial_payments_transaction ON partial_payments(transaction_id);
CREATE INDEX idx_partial_payments_due ON partial_payments(due_date, status);

-- -----------------------------------------------------------------------------
-- F. FINANCE LEDGER (Buku Besar)
-- -----------------------------------------------------------------------------

CREATE TABLE finance_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Entry info
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type ledger_entry_type NOT NULL,
    account_type ledger_account_type NOT NULL,
    
    -- Amount
    amount DECIMAL(15, 2) NOT NULL,
    
    -- Description
    description TEXT NOT NULL,
    
    -- Reference
    reference_type VARCHAR(50), -- 'TRANSACTION', 'REFUND', 'COMMISSION', 'ROYALTY'
    reference_id UUID,
    
    -- Related parties
    related_user_id UUID REFERENCES users(id), -- Untuk komisi/royalti ke siapa
    
    -- Balancing entry (double-entry bookkeeping)
    paired_entry_id UUID REFERENCES finance_ledger(id),
    
    -- Status
    is_reconciled BOOLEAN DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES users(id),
    
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_date ON finance_ledger(entry_date);
CREATE INDEX idx_ledger_type ON finance_ledger(entry_type, account_type);
CREATE INDEX idx_ledger_reference ON finance_ledger(reference_type, reference_id);
CREATE INDEX idx_ledger_user ON finance_ledger(related_user_id);

-- -----------------------------------------------------------------------------
-- G. COMMISSION & ROYALTY RULES
-- -----------------------------------------------------------------------------

-- Aturan pembagian komisi
CREATE TABLE commission_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Applies to
    product_id UUID REFERENCES products(id), -- NULL = semua produk
    product_category VARCHAR(100), -- Atau berdasarkan kategori
    
    -- Commission recipient type
    recipient_type VARCHAR(50) NOT NULL, -- 'FACILITATOR', 'SALES', 'REFERRER'
    
    -- Commission calculation
    calculation_type VARCHAR(50) NOT NULL, -- 'PERCENTAGE', 'FIXED'
    value DECIMAL(10, 4) NOT NULL, -- 0.1 = 10% atau nominal
    max_amount DECIMAL(15, 2), -- Cap maksimal
    
    -- Priority (untuk stacking)
    priority INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_rules_product ON commission_rules(product_id);
CREATE INDEX idx_commission_rules_active ON commission_rules(is_active, valid_from, valid_until);

-- Royalty rules (untuk IP owner seperti John Maxwell)
CREATE TABLE royalty_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- IP Owner
    owner_name VARCHAR(255) NOT NULL, -- 'John Maxwell', dll
    owner_contact_info JSONB DEFAULT '{}',
    
    -- Applies to
    product_id UUID REFERENCES products(id),
    product_tags VARCHAR[] DEFAULT '{}', -- Tag produk yang kena royalti
    
    -- Royalty calculation
    calculation_type VARCHAR(50) NOT NULL,
    value DECIMAL(10, 4) NOT NULL,
    
    -- Payment schedule
    payment_schedule VARCHAR(50) DEFAULT 'MONTHLY', -- MONTHLY, QUARTERLY, YEARLY
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_royalty_rules_product ON royalty_rules(product_id);

-- Commission/Royalty payouts (log pembayaran)
CREATE TABLE commission_payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Recipient
    recipient_user_id UUID REFERENCES users(id),
    recipient_external_name VARCHAR(255), -- Untuk royalti ke pihak luar
    
    -- Type
    payout_type VARCHAR(50) NOT NULL, -- 'COMMISSION', 'ROYALTY'
    
    -- Amount
    gross_amount DECIMAL(15, 2) NOT NULL,
    tax_amount DECIMAL(15, 2) DEFAULT 0,
    net_amount DECIMAL(15, 2) NOT NULL,
    
    -- Period covered
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, PROCESSING, PAID, CANCELLED
    processed_at TIMESTAMPTZ,
    
    -- Payment details
    payment_reference VARCHAR(100),
    bank_transfer_proof_url TEXT,
    
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payouts_recipient ON commission_payouts(recipient_user_id);
CREATE INDEX idx_payouts_status ON commission_payouts(status);
CREATE INDEX idx_payouts_period ON commission_payouts(period_start, period_end);
