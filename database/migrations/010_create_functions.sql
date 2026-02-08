-- =============================================================================
-- MAXWELL ERP - Useful Functions & Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON master_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON member_wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Generate unique QR string for wallet
CREATE OR REPLACE FUNCTION generate_wallet_qr()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.unique_qr_string IS NULL THEN
        NEW.unique_qr_string = 'WLT-' || encode(gen_random_bytes(16), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_qr BEFORE INSERT ON member_wallets
    FOR EACH ROW EXECUTE FUNCTION generate_wallet_qr();

-- Generate transaction number
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(transaction_number FROM 'INV-[0-9]+-([0-9]+)') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM transactions
    WHERE DATE(created_at) = CURRENT_DATE;
    
    NEW.transaction_number = 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(seq_num::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_number BEFORE INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION generate_transaction_number();

-- Generate gift token
CREATE OR REPLACE FUNCTION generate_gift_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.token IS NULL THEN
        NEW.token = encode(gen_random_bytes(32), 'hex');
    END IF;
    IF NEW.token_expires_at IS NULL THEN
        NEW.token_expires_at = NOW() + INTERVAL '7 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gift_token BEFORE INSERT ON gift_allocations
    FOR EACH ROW EXECUTE FUNCTION generate_gift_token();
