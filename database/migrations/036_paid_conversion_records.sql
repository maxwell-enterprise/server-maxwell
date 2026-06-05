-- =============================================================================
-- MAXWELL ERP - Paid conversion tracking (campaign + PIC snapshot per payment)
-- Run this migration on Supabase before deploying BE logic.
-- =============================================================================

-- PIC assignment history: who is PIC for a buyer/org, with effective dates.
create table if not exists pic_assignments (
  id uuid primary key default gen_random_uuid(),
  subject_member_id uuid references members(id) on delete set null,
  subject_email text not null,
  pic_member_id uuid references members(id) on delete set null,
  pic_name text,
  assignment_status text not null default 'CONFIRMED'
    check (assignment_status in ('PROPOSED', 'SIGNED', 'CONFIRMED')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  assigned_by text,
  notes text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists idx_pic_assignments_subject_member
  on pic_assignments(subject_member_id)
  where effective_to is null;

create index if not exists idx_pic_assignments_subject_email_ci
  on pic_assignments(lower(subject_email))
  where effective_to is null;

create index if not exists idx_pic_assignments_effective_range
  on pic_assignments(subject_member_id, effective_from, effective_to);

-- One immutable row per successful (PAID) payment — campaign + PIC snapshot at paid time.
create table if not exists paid_conversion_records (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null unique references payment_transactions(id) on delete cascade,
  "orderId" text not null,
  buyer_email text not null,
  buyer_name text,
  buyer_member_id uuid references members(id) on delete set null,
  campaign_source_code text,
  campaign_name text,
  acquisition_type text not null default 'DIRECT'
    check (acquisition_type in ('CAMPAIGN', 'DIRECT', 'PIC_REFERRAL', 'ORG_REFERRAL', 'UNKNOWN')),
  pic_member_id_snapshot uuid references members(id) on delete set null,
  pic_name_snapshot text,
  pic_assignment_id_snapshot uuid references pic_assignments(id) on delete set null,
  amount numeric(18,2) not null default 0,
  "totalAmount" numeric(18,2) not null default 0,
  products_summary text,
  "itemsSnapshot" jsonb,
  paid_at timestamptz not null default now(),
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_paid_conversion_records_paid_at
  on paid_conversion_records(paid_at desc);

create index if not exists idx_paid_conversion_records_buyer_email_ci
  on paid_conversion_records(lower(buyer_email));

create index if not exists idx_paid_conversion_records_campaign
  on paid_conversion_records(campaign_source_code)
  where campaign_source_code is not null;

create index if not exists idx_paid_conversion_records_pic_snapshot
  on paid_conversion_records(pic_member_id_snapshot)
  where pic_member_id_snapshot is not null;

-- Backfill existing PAID payments (idempotent via ON CONFLICT DO NOTHING).
insert into paid_conversion_records (
  payment_transaction_id,
  "orderId",
  buyer_email,
  buyer_name,
  buyer_member_id,
  campaign_source_code,
  campaign_name,
  acquisition_type,
  amount,
  "totalAmount",
  products_summary,
  "itemsSnapshot",
  paid_at
)
select
  pt.id,
  pt."orderId",
  pt."customerEmail",
  m.name,
  m.id,
  pt."attributionSource",
  c.name,
  case
    when pt."attributionSource" is not null and btrim(pt."attributionSource") <> '' then 'CAMPAIGN'
    else 'DIRECT'
  end,
  coalesce(pt.amount, 0),
  coalesce(pt."totalAmount", 0),
  (
    select string_agg(
      coalesce(item->>'productName', item->>'name', item->>'productId', 'Item'),
      ', '
    )
    from jsonb_array_elements(coalesce(pt."itemsSnapshot", '[]'::jsonb)) as item
  ),
  pt."itemsSnapshot",
  coalesce(pt."createdAt", now())
from payment_transactions pt
left join members m on lower(m.email) = lower(pt."customerEmail")
left join campaigns c on lower(c."sourceCode") = lower(pt."attributionSource")
where pt.status = 'PAID'
on conflict (payment_transaction_id) do nothing;

-- Backfill PIC snapshot for rows where an active assignment exists today (best-effort).
update paid_conversion_records pcr
set
  pic_member_id_snapshot = pa.pic_member_id,
  pic_name_snapshot = coalesce(pa.pic_name, pm.name),
  pic_assignment_id_snapshot = pa.id,
  acquisition_type = case
    when pcr.campaign_source_code is not null and btrim(pcr.campaign_source_code) <> '' then 'CAMPAIGN'
    else 'PIC_REFERRAL'
  end
from pic_assignments pa
left join members pm on pm.id = pa.pic_member_id
where pa.effective_to is null
  and (
    (pcr.buyer_member_id is not null and pa.subject_member_id = pcr.buyer_member_id)
    or lower(pa.subject_email) = lower(pcr.buyer_email)
  )
  and pcr.pic_member_id_snapshot is null;
