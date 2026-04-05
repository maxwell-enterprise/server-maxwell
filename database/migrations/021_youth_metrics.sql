-- Youth Impact — aligns with FE `YouthMetric` (types/business_specifics.ts)
-- Run on Supabase / Postgres before using Nest `/fe/youth-impact/metrics`

CREATE TABLE IF NOT EXISTS youth_metrics (
  id TEXT PRIMARY KEY,
  school_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  status TEXT NOT NULL,
  students_impacted INTEGER NOT NULL DEFAULT 0,
  program_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT youth_metrics_status_check CHECK (
    status IN ('LEAD', 'MOU_SIGNED', 'PROGRAM_ACTIVE')
  ),
  CONSTRAINT youth_metrics_program_check CHECK (
    program_type IN ('iChoose', 'iDo', 'iLead')
  )
);

CREATE INDEX IF NOT EXISTS idx_youth_metrics_status ON youth_metrics (status);
CREATE INDEX IF NOT EXISTS idx_youth_metrics_program ON youth_metrics (program_type);

-- Optional seed (matches former FE mock seed)
INSERT INTO youth_metrics (id, school_name, contact_person, status, students_impacted, program_type)
VALUES
  ('SCH-001', 'SMA Negeri 1 Jakarta', 'Bpk. Budi', 'MOU_SIGNED', 120, 'iChoose'),
  ('SCH-002', 'Universitas Pelita Harapan', 'Ibu Sarah', 'PROGRAM_ACTIVE', 450, 'iLead'),
  ('SCH-003', 'Binus School', 'Mr. James', 'LEAD', 0, 'iDo')
ON CONFLICT (id) DO NOTHING;
