-- Schema optimization history (AI Database / Blueprint) — aligns with FE IndexedDB shape
CREATE TABLE IF NOT EXISTS schema_optimizations (
  id text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  summary text,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_schema_optimizations_ts ON schema_optimizations ("timestamp" DESC);
