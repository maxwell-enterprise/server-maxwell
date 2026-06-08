-- =============================================================================
-- MAXWELL ERP - Track campaign-attributed sign-ins (before purchase)
-- Run on Supabase after 036_paid_conversion_records.sql
-- =============================================================================

alter table paid_conversion_records
  add column if not exists event_type text not null default 'PAID'
    check (event_type in ('SIGNED_IN', 'PAID'));

-- Sign-in rows have no payment; PAID rows keep payment_transaction_id.
alter table paid_conversion_records
  alter column payment_transaction_id drop not null;

alter table paid_conversion_records
  alter column "orderId" drop not null;

-- One sign-in attribution row per person + campaign (idempotent).
create unique index if not exists idx_paid_conversion_records_signin_unique
  on paid_conversion_records (lower(buyer_email), lower(campaign_source_code), event_type)
  where event_type = 'SIGNED_IN'
    and campaign_source_code is not null
    and btrim(campaign_source_code) <> '';

create index if not exists idx_paid_conversion_records_event_type
  on paid_conversion_records (event_type, paid_at desc);
