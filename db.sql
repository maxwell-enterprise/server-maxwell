-- ============================================
-- GLOBAL EXTENSIONS
-- ============================================
create extension if not exists "pgcrypto";

-- ============================================
-- 1) CRM & INTERNAL USERS
-- ============================================

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  category text,
  scholarship boolean not null default false,
  "joinMonth" text not null,
  program text,
  "mentorshipDuration" integer,
  "nTagStatus" text,
  platform text,
  "regInUS" boolean default false,
  "lifecycleStage" text not null,
  company text,
  "jobTitle" text,
  industry text,
  tags text[],
  address jsonb,
  "socialProfile" jsonb,
  "birthDate" date,
  gender text,
  "linkedinUrl" text,
  "serviceLevel" text,
  achievements jsonb,
  "earnedDoneTags" text[],
  engagement jsonb,
  notes text,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists sys_internal_users (
  id text primary key,
  email text not null unique,
  "fullName" text not null,
  role text not null,
  "avatarUrl" text,
  provider text not null,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists user_notification_preferences (
  "userId" text primary key,
  "emailTransactional" boolean not null default false,
  "emailMarketing" boolean not null default false,
  "smsAlerts" boolean not null default false,
  "updatedAt" timestamptz not null default now()
);

create index if not exists idx_user_notification_preferences_updated
  on user_notification_preferences ("updatedAt" desc);

-- ============================================
-- 2) EVENTS, INVITATIONS, ATTENDANCE & TIERS
-- ============================================

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  public_id text,
  name text not null,
  date date not null,
  "endDate" date,
  time text,
  location text not null,
  "locationMode" text not null,
  "onlineMeetingLink" text,
  "locationMapLink" text,
  banner_url text,
  description text,
  capacity integer not null default 0,
  attendees integer not null default 0,
  revenue numeric(18,2) not null default 0,
  status text not null,
  "isVisibleInCatalog" boolean default false,
  type text not null,
  "parentEventId" uuid references events(id),
  "classId" text,
  "admissionPolicy" text not null,
  "creditTags" text[] not null default '{}',
  "doneTag" text,
  "isRecurring" boolean default false,
  "recurringMeta" jsonb,
  "selectionConfig" jsonb,
  gates jsonb,
  tiers jsonb,
  sessions jsonb,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists event_invitations (
  id uuid primary key default gen_random_uuid(),
  "eventId" uuid not null references events(id) on delete cascade,
  "eventName" text not null,
  "tierId" text,
  "tierName" text,
  "memberId" uuid not null references members(id) on delete cascade,
  "memberName" text not null,
  status text not null,
  "validUntil" timestamptz not null,
  "sentAt" timestamptz not null default now(),
  "sentBy" text not null
);

create table if not exists event_attendance_ledger (
  id uuid primary key default gen_random_uuid(),
  "eventId" uuid not null references events(id),
  "eventName" text not null,
  "memberId" text not null,
  "memberName" text not null,
  "memberEmail" text,
  "scannedAt" timestamptz not null,
  method text not null,
  "verificationCode" text,
  "eventColor" text,
  "gateId" text,
  "sessionId" text,
  "ticketTier" text,
  status text,
  "ticketUniqueId" text,
  "scannerDevice" text
);

create table if not exists ref_master_tiers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  "basePriceIdr" numeric(18,2),
  "createdAt" timestamptz default now()
);

create table if not exists credit_tags (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  type text not null,
  "usageLimit" integer not null default 0,
  "isActive" boolean not null default true
);

-- ============================================
-- 3) PRODUCTS, CARTS, DISCOUNTS & PRICING
-- ============================================

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  "priceIdr" numeric(18,2) not null,
  "compareAtPriceIdr" numeric(18,2),
  category text not null,
  "imageUrl" text,
  items jsonb not null,
  "hasVariants" boolean not null default false,
  variants jsonb,
  "installmentConfig" jsonb,
  "isActive" boolean not null default true
);

create table if not exists active_shopping_carts (
  "sessionId" text primary key,
  "userId" text,
  "userEmail" text,
  items jsonb not null,
  "lastUpdated" timestamptz not null,
  "totalValue" numeric(18,2) not null default 0,
  status text not null
);

create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  type text not null,
  value numeric(18,2) not null,
  scope text not null,
  "targetIds" text[],
  "validFrom" timestamptz not null,
  "validUntil" timestamptz not null,
  "maxUsageLimit" integer,
  "currentUsageCount" integer not null default 0,
  "maxBudgetLimit" numeric(18,2),
  "currentBudgetBurned" numeric(18,2) not null default 0,
  "isFeatured" boolean default false,
  conditions jsonb,
  "minQty" integer,
  "createdAt" timestamptz default now()
);

create table if not exists discount_redemption_logs (
  id uuid primary key default gen_random_uuid(),
  "discountId" uuid references discounts(id),
  "discountCode" text not null,
  "userId" text,
  "orderId" text,
  "ruleId" text,
  amount numeric(18,2) not null,
  "specificDiscount" numeric(18,2),
  timestamp timestamptz not null default now(),
  metadata jsonb
);

create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  "segment" text,
  "targetProductIds" text[],
  conditions jsonb,
  "maxBudget" numeric(18,2),
  "currentSpend" numeric(18,2) default 0,
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

-- ============================================
-- 4) FINANCE, TRANSACTIONS & PAYMENTS
-- ============================================

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  "legacy_id" text,
  date date not null,
  type text not null, -- 'PO' | 'Expense' | 'Royalty'
  description text not null,
  amount numeric(18,2) not null,
  status text not null,
  "eventId" uuid references events(id),
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  "orderId" text not null,
  amount numeric(18,2) not null,
  "discountAmount" numeric(18,2),
  "uniqueCode" integer,
  "totalAmount" numeric(18,2) not null,
  "paidAmount" numeric(18,2) not null default 0,
  "balanceDue" numeric(18,2) not null default 0,
  "installmentPlan" jsonb,
  refunds jsonb,
  method text not null,
  status text not null,
  "createdAt" timestamptz not null default now(),
  "expiryTime" timestamptz not null,
  "customerEmail" text not null,
  "attributionSource" text,
  "virtualAccountNumber" text,
  "qrisUrl" text,
  "bankDetails" jsonb,
  "proofOfPaymentUrl" text,
  "itemsSnapshot" jsonb
);

create table if not exists payout_transactions (
  id uuid primary key default gen_random_uuid(),
  "beneficiaryId" text not null,
  "beneficiaryName" text,
  "sourceMemberId" text,
  "sourceMemberName" text,
  "productId" text,
  "productName" text,
  amount numeric(18,2) not null,
  status text not null,
  "createdAt" timestamptz default now(),
  "paidAt" timestamptz
);

-- ============================================
-- 5) WALLET & ENTITLEMENTS
-- ============================================

create table if not exists user_entitlements (
  "userId" text primary key,
  permissions text[] not null,
  attributes jsonb not null,
  credits numeric(18,2) not null default 0
);

create table if not exists wallet_items (
  id uuid primary key default gen_random_uuid(),
  "userId" text not null,
  type text not null,
  title text not null,
  subtitle text,
  "expiryDate" timestamptz,
  "qrData" text,
  status text not null,
  "isTransferable" boolean default false,
  "sponsoredBy" text,
  meta jsonb,
  "createdAt" timestamptz default now()
);

create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  "walletItemId" uuid not null references wallet_items(id) on delete cascade,
  "userId" text not null,
  "transactionType" text not null,
  "amountChange" numeric(18,2) not null,
  "balanceAfter" numeric(18,2) not null,
  "referenceId" text,
  "referenceName" text,
  timestamp timestamptz not null default now()
);

create table if not exists gift_allocations (
  id uuid primary key default gen_random_uuid(),
  "sourceUserId" text not null,
  "sourceUserName" text not null,
  "entitlementId" uuid not null references wallet_items(id),
  "itemName" text not null,
  "targetEmail" text,
  "claimToken" text not null unique,
  status text not null,
  "claimedByUserId" text,
  "claimedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);

create table if not exists corporate_members (
  id uuid primary key default gen_random_uuid(),
  "orgId" text not null,
  email text not null,
  name text not null,
  status text not null,
  "joinedAt" timestamptz,
  "lastActive" timestamptz
);

-- ============================================
-- 6) INVENTORY
-- ============================================

create table if not exists inventory (
  sku text primary key,
  name text not null,
  category text,
  stock integer not null default 0,
  "reorderLevel" integer not null default 0,
  status text not null,
  price numeric(18,2) not null default 0
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  sku text not null references inventory(sku),
  type text not null,
  quantity integer not null,
  "balanceAfter" integer not null,
  reference text,
  "performedBy" text,
  timestamp timestamptz not null default now()
);

-- ============================================
-- 7) CONTENT & ENABLEMENT
-- ============================================

create table if not exists cms_content (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  body text not null,
  "imageUrl" text,
  type text not null,
  status text not null,
  "publishDate" timestamptz not null,
  "unpublishDate" timestamptz,
  "linkedProductId" uuid references products(id),
  "ctaLabel" text,
  author text not null,
  tags text[] not null default '{}',
  stats jsonb not null,
  "createdAt" timestamptz default now()
);

create table if not exists enablement_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  summary text,
  content text not null,
  "readTimeMin" integer,
  "isFeatured" boolean default false,
  "linkedEventId" uuid references events(id),
  "createdAt" timestamptz default now()
);

create table if not exists enablement_quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  "linkedEventId" uuid references events(id),
  questions jsonb not null,
  "passingScore" integer not null,
  "createdAt" timestamptz default now()
);

create table if not exists enablement_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  "quizId" uuid not null references enablement_quizzes(id),
  "userId" text not null,
  score integer not null,
  passed boolean not null,
  "completedAt" timestamptz not null,
  "eventId" uuid references events(id)
);

-- ============================================
-- 8) SUPPORT, AUDIT, SECURITY & AI USAGE
-- ============================================

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  "memberId" text not null,
  "memberName" text not null,
  subject text not null,
  description text not null,
  priority text not null,
  status text not null,
  "assignedRole" text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists member_activity_logs (
  id uuid primary key default gen_random_uuid(),
  "memberId" text not null,
  date date not null,
  category text not null,
  action text not null,
  details text,
  metadata jsonb,
  "createdAt" timestamptz default now()
);

create table if not exists system_security_logs (
  id uuid primary key default gen_random_uuid(),
  "userId" text,
  action text not null,
  "ipAddress" text,
  "userAgent" text,
  context jsonb,
  timestamp timestamptz not null default now()
);

create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  "userId" text not null,
  "featureName" text not null,
  model text not null,
  prompt text not null,
  response text not null,
  "promptTokens" integer not null,
  "completionTokens" integer not null,
  "totalTokens" integer not null,
  "costUSD" numeric(18,6) not null,
  "costIDR" numeric(18,2) not null
);

-- Schema optimization history (AI Database / Blueprint) — Nest /fe/system/database/schema-optimizations
create table if not exists schema_optimizations (
  id text primary key,
  version integer not null default 1,
  summary text,
  "timestamp" timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb
);

create index if not exists idx_schema_optimizations_ts on schema_optimizations ("timestamp" desc);

-- Automation trigger catalog (admin Select Trigger) — Nest GET /fe/system/automation-triggers
create table if not exists automation_trigger_definitions (
  id text primary key,
  label text not null,
  description text not null,
  category text not null,
  icon_name text not null default 'Zap',
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_trigger_definitions_active_sort
  on automation_trigger_definitions (is_active, sort_order, id);

-- ============================================
-- 9) TRIBE, RESEARCH, ROUND TABLE, SCOUT
-- ============================================

create table if not exists tribe_mentoring_sessions (
  id uuid primary key default gen_random_uuid(),
  "facilitatorId" text not null,
  "facilitatorName" text,
  "eventId" uuid references events(id),
  "eventName" text,
  "memberId" text,
  "memberName" text,
  notes text,
  "createdAt" timestamptz default now()
);

create table if not exists research_results (
  id uuid primary key default gen_random_uuid(),
  "memberId" text not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  data jsonb not null
);

create table if not exists round_table_sessions (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  "hostName" text not null,
  "scheduledAt" timestamptz not null,
  "maxSeats" integer,
  "createdAt" timestamptz default now()
);

create table if not exists lead_scout_conversations (
  id uuid primary key default gen_random_uuid(),
  "leadName" text not null,
  "leadEmail" text not null,
  "createdAt" timestamptz not null default now(),
  messages jsonb not null,
  score jsonb,
  status text not null
);

-- ============================================
-- 10) CONTRACTS, PDF, SETTINGS & ROLES
-- ============================================

create table if not exists contract_master_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  clauses jsonb not null,
  "createdAt" timestamptz default now()
);

create table if not exists contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  body text,
  metadata jsonb,
  "createdAt" timestamptz default now()
);

create table if not exists contract_instances (
  id uuid primary key default gen_random_uuid(),
  "templateId" uuid references contract_templates(id),
  "memberId" text,
  "memberName" text,
  status text not null,
  "signedAt" timestamptz,
  "expiresAt" timestamptz,
  data jsonb,
  "createdAt" timestamptz default now()
);

create table if not exists sys_pdf_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  orientation text not null,
  pages jsonb not null,
  "createdAt" timestamptz default now()
);

create table if not exists system_settings (
  id text primary key,
  config jsonb not null,
  "updatedAt" timestamptz default now()
);

create table if not exists auth_roles (
  id text primary key,
  name text not null,
  description text,
  permissions jsonb,
  "createdAt" timestamptz default now()
);

-- ============================================
-- 11) CERTIFICATION, MENTORS, ROYALTY & OPS
-- ============================================

create table if not exists certification_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  criteria jsonb not null,
  "createdAt" timestamptz default now()
);

create table if not exists master_done_tags (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  "createdAt" timestamptz default now()
);

create table if not exists mentor_personas (
  id uuid primary key default gen_random_uuid(),
  "mentorId" text not null,
  persona jsonb not null,
  "createdAt" timestamptz default now()
);

create table if not exists royalty_contracts (
  id uuid primary key default gen_random_uuid(),
  "partnerName" text not null,
  "productId" uuid references products(id),
  "productName" text,
  percentage numeric(5,2) not null,
  "effectiveFrom" date not null,
  "effectiveTo" date,
  "createdAt" timestamptz default now()
);

create table if not exists ops_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tasks jsonb not null,
  "createdAt" timestamptz default now()
);

create table if not exists ops_checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tasks jsonb not null,
  "createdAt" timestamptz default now()
);

-- ============================================
-- 12) AUTOMATION QUEUE & BACKGROUND JOBS
-- ============================================

create table if not exists automation_queue (
  id text primary key,
  "triggerType" text not null,
  "contextData" jsonb not null,
  status text not null,
  "createdAt" timestamptz not null,
  "processedAt" timestamptz,
  "errorLog" text,
  description text not null
);

create table if not exists system_background_jobs (
  id text primary key,
  type text not null,
  payload jsonb not null,
  status text not null,
  timestamp timestamptz not null
);

-- ============================================
-- 13) WHATSAPP, EMAIL & GAMIFICATION
-- ============================================

create table if not exists whatsapp_task_queue (
  id text primary key,
  "recipientName" text not null,
  "recipientPhone" text not null,
  message text not null,
  category text not null,
  status text not null,
  "createdAt" timestamptz not null default now(),
  metadata jsonb
);

create table if not exists whatsapp_templates (
  id text primary key,
  category text not null,
  label text not null,
  message text not null,
  variables text[] not null default '{}',
  "isDefault" boolean not null default false,
  "linkedTriggerId" text,
  "uiContext" text[]
);

create table if not exists email_templates (
  id text primary key,
  name text not null,
  category text not null,
  subject text not null,
  body text not null,
  variables text[] not null default '{}'
);

create table if not exists email_campaigns (
  id text primary key,
  name text not null,
  subject text not null,
  body text not null,
  status text not null,
  "triggerType" text not null,
  "scheduledAt" timestamptz,
  "eventRelativeConfig" jsonb,
  "audienceFilter" jsonb,
  attachments jsonb,
  stats jsonb,
  "createdAt" timestamptz not null,
  "createdBy" text not null
);

create table if not exists email_logs (
  id text primary key,
  "templateId" text,
  "campaignId" text,
  "recipientEmail" text not null,
  subject text not null,
  "sentAt" timestamptz not null,
  status text not null,
  "openedAt" timestamptz,
  metadata jsonb
);

create table if not exists gamification_badges (
  id text primary key,
  code text not null unique,
  name text not null,
  description text,
  icon text,
  rarity text not null,
  "pointBonus" integer not null,
  "autoTrigger" text,
  "triggerThreshold" integer
);

create table if not exists gamification_rules (
  id text primary key,
  "triggerType" text not null,
  points integer not null,
  description text,
  "isActive" boolean not null default true
);

create table if not exists gamification_profiles (
  "userId" text primary key,
  "userName" text not null,
  "avatarUrl" text,
  "totalPoints" integer not null,
  "currentLevel" text not null,
  badges text[] not null default '{}',
  rank integer,
  "streakCount" integer not null
);

-- ============================================
-- 14) MENTORING SESSIONS & CAMPAIGNS
-- ============================================

create table if not exists mentoring_sessions (
  id text primary key,
  "menteeId" text not null,
  "mentorId" text not null,
  status text not null,
  memory jsonb not null,
  "lastSummary" text,
  "actionPlan" jsonb not null,
  "progressScore" integer not null,
  "updatedAt" timestamptz not null
);

create table if not exists campaigns (
  id text primary key,
  name text not null,
  "sourceCode" text not null unique,
  category text not null,
  "targetProductId" text,
  "linkedDiscountCode" text,
  "generatedLink" text not null,
  "createdAt" timestamptz not null,
  clicks integer not null default 0,
  conversions integer not null default 0,
  revenue numeric(18,2) not null default 0
);

-- ============================================
-- 15) YOUTH IMPACT (FE YouthMetric — Nest /fe/youth-impact/metrics)
-- ============================================

create table if not exists youth_metrics (
  id text primary key,
  school_name text not null,
  contact_person text not null,
  status text not null,
  students_impacted integer not null default 0,
  program_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint youth_metrics_status_check check (
    status in ('LEAD', 'MOU_SIGNED', 'PROGRAM_ACTIVE')
  ),
  constraint youth_metrics_program_check check (
    program_type in ('iChoose', 'iDo', 'iLead')
  )
);

create index if not exists idx_youth_metrics_status on youth_metrics (status);
create index if not exists idx_youth_metrics_program on youth_metrics (program_type);