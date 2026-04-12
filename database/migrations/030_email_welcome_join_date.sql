-- Add join_date placeholder to default welcome template (NEW_MEMBER automation).

UPDATE email_templates
SET
  body = $wb$
<p>Hi {{member_name}},</p>
<p>Thank you for joining Maxwell Leadership Indonesia.</p>
<p>Your member ID: <strong>{{memberId}}</strong></p>
<p>Join date: {{join_date}}</p>
<p>We will use this email ({{email}}) and phone {{phone}} for important updates.</p>
<p>— Maxwell Team</p>
$wb$,
  variables = ARRAY['memberId', 'member_name', 'name', 'email', 'phone', 'join_date']::text[]
WHERE id = 'TPL-EMAIL-WELCOME';
