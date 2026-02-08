-- =============================================================================
-- MAXWELL ERP - Commerce & Product Tables (The Store)
-- =============================================================================
-- Tabel untuk produk, stok, dan entitlement

-- -----------------------------------------------------------------------------
-- A. PRODUCTS (Katalog Toko)
-- -----------------------------------------------------------------------------

-- Produk Utama
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    short_description VARCHAR(500),
    
    -- Type
    type product_type NOT NULL,
    is_bundle BOOLEAN DEFAULT false, -- Apakah bundling beberapa item
    
    -- Pricing
    base_price_idr DECIMAL(15, 2) NOT NULL,
    sale_price_idr DECIMAL(15, 2), -- Harga diskon (jika ada)
    
    -- Stock Management
    stock_type stock_type NOT NULL,
    current_stock INTEGER, -- NULL untuk UNLIMITED
    reserved_stock INTEGER DEFAULT 0, -- Stok yang sedang di-checkout
    
    -- Untuk SHARED_EVENT stock type
    linked_event_id UUID REFERENCES master_events(id),
    linked_tier_id UUID REFERENCES event_tiers(id),
    
    -- Media
    thumbnail_url TEXT,
    gallery_urls JSONB DEFAULT '[]',
    
    -- Availability
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    available_from TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    
    -- Limits
    max_per_order INTEGER, -- Maksimal qty per order
    max_per_user INTEGER, -- Maksimal total yang bisa dibeli satu user
    
    -- Category & Tags
    category VARCHAR(100),
    tags JSONB DEFAULT '[]',
    
    -- SEO & Display
    sort_order INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = true;
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_linked_event ON products(linked_event_id);

-- -----------------------------------------------------------------------------
-- B. PRODUCT ENTITLEMENTS (Isi Paket / Resep)
-- -----------------------------------------------------------------------------

-- Apa yang didapat user saat membeli produk
CREATE TABLE product_entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    
    -- Apa yang didapat
    tag_id UUID REFERENCES master_access_tags(id), -- Tag yang diberikan
    item_type item_type NOT NULL,
    
    -- Quantity
    amount INTEGER NOT NULL DEFAULT 1, -- Jumlah kredit/qty yang didapat
    
    -- Untuk item fisik
    physical_item_name VARCHAR(255),
    physical_item_sku VARCHAR(100),
    
    -- Untuk item digital
    digital_access_url TEXT,
    digital_access_type VARCHAR(100), -- 'LMS', 'EBOOK', 'VIDEO'
    
    -- Metadata
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entitlements_product ON product_entitlements(product_id);
CREATE INDEX idx_entitlements_tag ON product_entitlements(tag_id);

-- -----------------------------------------------------------------------------
-- C. PRICING TIERS (Early Bird, Regular, dll)
-- -----------------------------------------------------------------------------

CREATE TABLE product_pricing_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    
    tier pricing_tier NOT NULL,
    name VARCHAR(100) NOT NULL,
    
    price_idr DECIMAL(15, 2) NOT NULL,
    
    -- Kapan tier ini aktif
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    
    -- Kuota tier ini
    max_quantity INTEGER,
    sold_quantity INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_tiers_product ON product_pricing_tiers(product_id);
CREATE INDEX idx_pricing_tiers_dates ON product_pricing_tiers(start_at, end_at);

-- -----------------------------------------------------------------------------
-- D. VOUCHERS & COUPONS
-- -----------------------------------------------------------------------------

CREATE TABLE vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Discount Type
    discount_type VARCHAR(20) NOT NULL, -- 'PERCENTAGE', 'FIXED'
    discount_value DECIMAL(15, 2) NOT NULL,
    max_discount_amount DECIMAL(15, 2), -- Cap untuk percentage
    
    -- Minimum Purchase
    min_purchase_amount DECIMAL(15, 2),
    
    -- Usage Limits
    max_usage INTEGER, -- Total penggunaan
    max_usage_per_user INTEGER,
    current_usage INTEGER DEFAULT 0,
    
    -- Applicable Products (NULL = semua)
    applicable_product_ids UUID[] DEFAULT NULL,
    applicable_categories VARCHAR[] DEFAULT NULL,
    
    -- Validity
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_valid ON vouchers(valid_from, valid_until);

-- Voucher Usage Tracking
CREATE TABLE voucher_usages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    transaction_id UUID, -- Will reference transactions table
    
    discount_applied DECIMAL(15, 2) NOT NULL,
    used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voucher_usages_voucher ON voucher_usages(voucher_id);
CREATE INDEX idx_voucher_usages_user ON voucher_usages(user_id);

-- -----------------------------------------------------------------------------
-- E. PHYSICAL INVENTORY (Warehouse Management)
-- -----------------------------------------------------------------------------

CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Stock
    current_stock INTEGER NOT NULL DEFAULT 0,
    reserved_stock INTEGER DEFAULT 0,
    reorder_level INTEGER, -- Alert ketika stok di bawah ini
    
    -- Location
    warehouse_location VARCHAR(100),
    
    -- Pricing (untuk tracking cost)
    cost_price_idr DECIMAL(15, 2),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_sku ON inventory_items(sku);

-- Inventory Movement Log
CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    
    movement_type VARCHAR(50) NOT NULL, -- 'GOODS_RECEIPT', 'GOODS_ISSUE', 'ADJUSTMENT', 'RETURN'
    quantity INTEGER NOT NULL, -- Positive = masuk, Negative = keluar
    
    reference_type VARCHAR(50), -- 'TRANSACTION', 'MANUAL', 'RETURN'
    reference_id UUID,
    
    notes TEXT,
    performed_by UUID REFERENCES users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_movements_item ON inventory_movements(inventory_item_id);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(performed_at);

-- -----------------------------------------------------------------------------
-- F. SHOPPING CART
-- -----------------------------------------------------------------------------

CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Session for guest carts
    session_id VARCHAR(255),
    
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_session ON carts(session_id);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    
    quantity INTEGER NOT NULL DEFAULT 1,
    
    -- Snapshot harga saat ditambahkan
    unit_price_idr DECIMAL(15, 2) NOT NULL,
    pricing_tier_id UUID REFERENCES product_pricing_tiers(id),
    
    -- Voucher applied ke item ini
    voucher_id UUID REFERENCES vouchers(id),
    discount_amount DECIMAL(15, 2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product ON cart_items(product_id);
