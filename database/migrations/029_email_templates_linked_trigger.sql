-- Link transactional email templates to automation triggers (one template per trigger).
-- Keeps FE Event Registry + Nest send-by-trigger in sync with admin-designed templates.

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS "linkedTriggerId" text;

CREATE INDEX IF NOT EXISTS idx_email_templates_linked_trigger
  ON email_templates ("linkedTriggerId")
  WHERE "linkedTriggerId" IS NOT NULL AND "linkedTriggerId" <> '';

-- Default welcome template: placeholders must match FE/BE payload contract (EMAIL_WELCOME_SENT).
INSERT INTO email_templates (id, name, category, subject, body, variables, "linkedTriggerId")
VALUES (
  'TPL-EMAIL-WELCOME',
  'Welcome (Transactional)',
  'TRANSACTIONAL',
  'Welcome to Maxwell Leadership, {{name}}',
  $wb$
<p>Hi {{member_name}},</p>
<p>Thank you for joining Maxwell Leadership Indonesia.</p>
<p>Your member ID: <strong>{{memberId}}</strong></p>
<p>We will use this email ({{email}}) and phone {{phone}} for important updates.</p>
<p>— Maxwell Team</p>
$wb$,
  ARRAY['memberId', 'member_name', 'name', 'email', 'phone']::text[],
  'EMAIL_WELCOME_SENT'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  variables = EXCLUDED.variables,
  "linkedTriggerId" = EXCLUDED."linkedTriggerId";
