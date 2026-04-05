-- FE PDF templates use string ids (e.g. PDF-CERT-001); align with email_* text PKs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sys_pdf_templates'
      AND column_name = 'id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE sys_pdf_templates ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE sys_pdf_templates
      ALTER COLUMN id TYPE text USING id::text;
  END IF;
END $$;
