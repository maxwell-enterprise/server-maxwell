-- =============================================================================
-- MAXWELL ERP - ENUM Types Definition
-- =============================================================================
-- Semua ENUM types untuk konsistensi data

-- -----------------------------------------------------------------------------
-- A. USER & MEMBER ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM (
    'SUPER_ADMIN',      -- Full access
    'ADMIN',            -- Admin operasional
    'FINANCE',          -- Akses keuangan
    'OPERATIONS',       -- Tim operasional event
    'FACILITATOR',      -- Mentor/Pelatih
    'SALES',            -- Tim penjualan
    'MEMBER',           -- Member biasa
    'GUEST'             -- Belum terdaftar penuh
);

CREATE TYPE member_lifecycle_stage AS ENUM (
    'GUEST',            -- Belum login/register
    'IDENTIFIED',       -- Sudah register, belum transaksi
    'PARTICIPANT',      -- Pernah ikut event
    'MEMBER',           -- Member aktif
    'CERTIFIED',        -- Sudah punya sertifikasi
    'FACILITATOR'       -- Jadi fasilitator/mentor
);

CREATE TYPE identity_type AS ENUM (
    'KTP',
    'PASSPORT',
    'SIM',
    'DRIVER_LICENSE'
);

-- -----------------------------------------------------------------------------
-- B. EVENT ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE event_type AS ENUM (
    'SINGLE',           -- Event sekali habis
    'SERIES',           -- Series Container (induk)
    'CLASS',            -- Anak dari SERIES
    'FESTIVAL',         -- Event besar multi-gate
    'RECURRING'         -- Event rutin (weekly meeting, dll)
);

CREATE TYPE event_status AS ENUM (
    'DRAFT',            -- Sedang dibuat
    'PUBLISHED',        -- Sudah bisa dilihat publik
    'REGISTRATION_OPEN', -- Pendaftaran dibuka
    'REGISTRATION_CLOSED', -- Pendaftaran ditutup
    'ONGOING',          -- Sedang berlangsung
    'COMPLETED',        -- Selesai
    'CANCELLED'         -- Dibatalkan
);

CREATE TYPE recurring_pattern AS ENUM (
    'DAILY',
    'WEEKLY',
    'BIWEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'YEARLY'
);

-- -----------------------------------------------------------------------------
-- C. ACCESS TAG (KEY) ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE tag_usage_type AS ENUM (
    'UNLIMITED',        -- Tidak terbatas penggunaan (misal: VIP Pass)
    'CONSUMABLE'        -- Habis pakai, ada kuota (misal: 5x workshop)
);

CREATE TYPE tag_category AS ENUM (
    'TICKET',           -- Tiket event
    'PASS',             -- Pass multi-event (Annual Pass, dll)
    'CREDIT',           -- Kredit flex (bisa ditukar kapan saja)
    'MEMBERSHIP',       -- Badge membership level
    'ACCESS'            -- Akses digital (LMS, dll)
);

-- -----------------------------------------------------------------------------
-- D. PRODUCT & COMMERCE ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE product_type AS ENUM (
    'TICKET',           -- Tiket event tunggal
    'PACKAGE',          -- Paket bundling
    'MERCHANDISE',      -- Barang fisik
    'DIGITAL',          -- Produk digital (ebook, video)
    'SUBSCRIPTION',     -- Langganan
    'DONATION'          -- Donasi/dukungan
);

CREATE TYPE item_type AS ENUM (
    'TICKET',           -- Entitlement tiket
    'PHYSICAL',         -- Barang fisik
    'DIGITAL'           -- Akses digital
);

CREATE TYPE stock_type AS ENUM (
    'PHYSICAL',         -- Stok fisik warehouse
    'SHARED_EVENT',     -- Stok berbagi dengan event
    'UNLIMITED'         -- Tidak terbatas
);

CREATE TYPE pricing_tier AS ENUM (
    'EARLY_BIRD',
    'REGULAR',
    'LAST_MINUTE',
    'VIP',
    'MEMBER_DISCOUNT'
);

-- -----------------------------------------------------------------------------
-- E. TRANSACTION & PAYMENT ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE payment_status AS ENUM (
    'PENDING',          -- Menunggu pembayaran
    'AWAITING_PAYMENT', -- Sudah dapat VA/QRIS, menunggu transfer
    'PAID',             -- Sudah dibayar
    'EXPIRED',          -- Expired
    'CANCELLED',        -- Dibatalkan user
    'REFUNDED',         -- Sudah refund penuh
    'PARTIAL_REFUND',   -- Refund sebagian
    'FAILED'            -- Gagal
);

CREATE TYPE payment_method AS ENUM (
    'BANK_TRANSFER',
    'VIRTUAL_ACCOUNT',
    'CREDIT_CARD',
    'DEBIT_CARD',
    'QRIS',
    'E_WALLET',
    'CASH',
    'INSTALLMENT'
);

CREATE TYPE transaction_type AS ENUM (
    'SALE',             -- Penjualan
    'REFUND',           -- Pengembalian
    'ADJUSTMENT',       -- Penyesuaian manual
    'PARTIAL_PAYMENT',  -- Pembayaran bertahap
    'GIFT'              -- Pemberian gratis
);

-- -----------------------------------------------------------------------------
-- F. WALLET ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE wallet_item_status AS ENUM (
    'ACTIVE',           -- Bisa dipakai
    'LOCKED',           -- Sedang dalam proses transfer
    'USED',             -- Sudah digunakan
    'EXPIRED',          -- Kadaluarsa
    'CANCELLED'         -- Dibatalkan
);

CREATE TYPE wallet_transaction_type AS ENUM (
    'PURCHASE',         -- Beli
    'USAGE',            -- Pakai (check-in)
    'TRANSFER_IN',      -- Terima transfer
    'TRANSFER_OUT',     -- Kirim transfer
    'REFUND',           -- Refund
    'ADJUSTMENT',       -- Penyesuaian manual
    'EXPIRY'            -- Kadaluarsa otomatis
);

-- -----------------------------------------------------------------------------
-- G. GIFT ALLOCATION ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE gift_status AS ENUM (
    'PENDING',          -- Belum diklaim
    'CLAIMED',          -- Sudah diklaim
    'REVOKED',          -- Ditarik kembali
    'EXPIRED'           -- Kadaluarsa
);

CREATE TYPE gift_delivery_method AS ENUM (
    'LINK',             -- Magic Link
    'EMAIL',            -- Via email
    'WHATSAPP',         -- Via WhatsApp
    'DIRECT'            -- Langsung ke user ID
);

-- -----------------------------------------------------------------------------
-- H. FINANCE LEDGER ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE ledger_entry_type AS ENUM (
    'DEBIT',
    'CREDIT'
);

CREATE TYPE ledger_account_type AS ENUM (
    'REVENUE',          -- Pendapatan
    'RECEIVABLE',       -- Piutang (AR)
    'PAYABLE',          -- Utang (AP)
    'COMMISSION',       -- Komisi
    'ROYALTY',          -- Royalti
    'REFUND',           -- Refund
    'TAX'               -- Pajak
);

-- -----------------------------------------------------------------------------
-- I. AUTOMATION ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE trigger_event AS ENUM (
    'PAYMENT_SUCCESS',
    'PAYMENT_FAILED',
    'CHECK_IN',
    'CHECK_OUT',
    'REGISTRATION',
    'GIFT_SENT',
    'GIFT_CLAIMED',
    'CERTIFICATE_ISSUED',
    'LEVEL_UP',
    'EVENT_REMINDER',
    'TICKET_EXPIRING'
);

CREATE TYPE action_type AS ENUM (
    'SEND_EMAIL',
    'SEND_WHATSAPP',
    'SEND_PUSH',
    'CREATE_TASK',
    'AWARD_POINTS',
    'UPDATE_STATUS',
    'WEBHOOK'
);

-- -----------------------------------------------------------------------------
-- J. CHECK-IN ENUMS
-- -----------------------------------------------------------------------------
CREATE TYPE checkin_status AS ENUM (
    'SUCCESS',
    'INVALID_TICKET',
    'WRONG_EVENT',
    'WRONG_GATE',
    'ALREADY_USED',
    'EXPIRED',
    'BLOCKED'
);

CREATE TYPE sync_status AS ENUM (
    'SYNCED',
    'PENDING_SYNC',
    'FAILED'
);
