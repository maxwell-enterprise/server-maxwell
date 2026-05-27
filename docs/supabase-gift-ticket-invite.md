# Supabase invite email — gift ticket recipients

When a user sends a **ticket gift** from the wallet flow (Manage invitations / ticket distribution) and fills **recipient email**, the Nest API persists the `gift_allocations` row as before, then calls **Supabase Auth Admin** `inviteUserByEmail`. If that address **already has** a Supabase Auth user, Nest sends a **magic link** email instead (`signInWithOtp`, `shouldCreateUser: false`) so they still receive mail to sign in at the same redirect URL.

## Backend environment (Nest)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Same as magic link / Google via Supabase — required. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Service role** JWT (not anon). Required for `inviteUserByEmail`. |
| `AUTH_PROVIDER` | If set to `legacy`, Supabase Auth is disabled and **no invite** is sent (gift still works). |
| `SUPABASE_GIFT_INVITE_REDIRECT_URL` | Optional. Full site URL **without** trailing slash recommended, e.g. `https://maxwell-refactor.vercel.app`. If unset, the code defaults to `https://maxwell-refactor.vercel.app`. |

## Supabase Dashboard (you configure)

1. **Authentication → URL configuration**  
   - Add `SUPABASE_GIFT_INVITE_REDIRECT_URL` (or your production app URL) to **Redirect URLs** so the link in the invite email is allowed.

2. **Authentication → Providers → Email**  
   - Ensure email auth is enabled.  
   - Configure **SMTP** or Supabase’s built-in mail (per your plan) so invite emails are actually delivered.

3. **Authentication → Email templates**  
   - Customize the **Invite user** template for new recipients.  
   - For **existing** Supabase Auth users, the app sends a **Magic link** instead — tune the **Magic link** template so the copy fits “you received a ticket gift, sign in here”.

4. **Rate limits / abuse**  
   - Invites run when a gift is created with a **non-empty recipient email**. Sending many gifts to the same address may hit Supabase rate limits.

## Behaviour notes

- **Phone-only gifts** (no email): no Supabase email is attempted.  
- **Failures** (network, misconfiguration): logged with `AuthService` / `WalletService` warnings; the gift transaction is **not** rolled back.  
- **New recipient in Supabase Auth**: `inviteUserByEmail` (invite template).  
- **Recipient already in Supabase Auth** (e.g. synced account): invite is not applicable; Nest sends a **magic link** via `signInWithOtp` (`shouldCreateUser: false`) to the same `SUPABASE_GIFT_INVITE_REDIRECT_URL` so they still get an email to sign in (Magic link template in Supabase).
