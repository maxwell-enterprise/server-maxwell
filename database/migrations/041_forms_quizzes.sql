-- Forms & Quizzes (workspace): definitions, deployments (QR sessions), responses.

CREATE TABLE IF NOT EXISTS forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE,
  title varchar(500) NOT NULL,
  description text,
  is_quiz boolean NOT NULL DEFAULT false,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  success_message text,
  active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forms_active_created
  ON forms (active, created_at DESC);

CREATE TABLE IF NOT EXISTS form_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE,
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  name varchar(500) NOT NULL,
  event_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_deployments_form_id
  ON form_deployments (form_id);

CREATE TABLE IF NOT EXISTS form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text UNIQUE,
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  deployment_id uuid REFERENCES form_deployments(id) ON DELETE SET NULL,
  user_id text,
  member_id text,
  user_name varchar(255),
  user_email varchar(255),
  user_phone varchar(50),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer,
  max_score integer,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_form_responses_form_id
  ON form_responses (form_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_responses_user_id
  ON form_responses (user_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_responses_email
  ON form_responses (lower(trim(user_email)));
