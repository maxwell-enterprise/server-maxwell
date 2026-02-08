-- =============================================================================
-- MAXWELL ERP - Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_cards ENABLE ROW LEVEL SECURITY;

-- Users: Can only view own profile (unless admin)
CREATE POLICY users_own_data ON users
    FOR ALL USING (
        id = current_setting('app.current_user_id')::uuid
        OR current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN')
    );

-- Member Wallets: User can only see own wallet
CREATE POLICY wallets_own_data ON member_wallets
    FOR SELECT USING (
        user_id = current_setting('app.current_user_id')::uuid
        OR current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS')
    );

CREATE POLICY wallets_insert ON member_wallets
    FOR INSERT WITH CHECK (
        current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS')
    );

CREATE POLICY wallets_update ON member_wallets
    FOR UPDATE USING (
        user_id = current_setting('app.current_user_id')::uuid
        OR current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN')
    );

-- Wallet Transactions: User can only see own transactions
CREATE POLICY wallet_tx_own_data ON wallet_transactions
    FOR SELECT USING (
        wallet_id IN (SELECT id FROM member_wallets WHERE user_id = current_setting('app.current_user_id')::uuid)
        OR current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
    );

-- Gift Allocations: Sender and recipient can see
CREATE POLICY gifts_own_data ON gift_allocations
    FOR SELECT USING (
        sender_user_id = current_setting('app.current_user_id')::uuid
        OR recipient_user_id = current_setting('app.current_user_id')::uuid
        OR current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN')
    );

-- Transactions: User can only see own transactions
CREATE POLICY transactions_own_data ON transactions
    FOR SELECT USING (
        user_id = current_setting('app.current_user_id')::uuid
        OR current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE')
    );

-- Membership Cards: User can only see own card
CREATE POLICY cards_own_data ON membership_cards
    FOR SELECT USING (
        user_id = current_setting('app.current_user_id')::uuid
        OR current_setting('app.user_role', true) IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS')
    );

-- Helper function to set session context
CREATE OR REPLACE FUNCTION set_app_context(p_user_id UUID, p_role TEXT)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::text, false);
    PERFORM set_config('app.user_role', p_role, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
