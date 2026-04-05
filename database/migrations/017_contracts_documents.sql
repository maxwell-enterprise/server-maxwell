-- Contract Center (FE-aligned): clauses as rows; templates & instances as JSON documents.
-- Apply to the same Postgres used by Nest (e.g. Supabase DATABASE_URL).

CREATE TABLE IF NOT EXISTS contract_clause_items (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_template_documents (
  id TEXT PRIMARY KEY,
  document JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contract_instance_documents (
  id TEXT PRIMARY KEY,
  document JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_clause_items_section ON contract_clause_items (section);
