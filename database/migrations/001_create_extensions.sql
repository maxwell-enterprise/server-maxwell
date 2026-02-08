-- =============================================================================
-- MAXWELL ERP - Database Extensions & Setup
-- =============================================================================
-- Ekstensi yang diperlukan untuk PostgreSQL

-- UUID Generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Untuk full-text search yang lebih baik
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Untuk cryptographic functions (hashing tokens, etc)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Untuk JSONB operators tambahan
CREATE EXTENSION IF NOT EXISTS "btree_gin";
