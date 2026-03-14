-- ============================================
-- Products: external public ID + audit timestamps
-- ============================================

alter table if exists products
  add column if not exists public_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update products
set public_id = concat('PRD-', substring(replace(id::text, '-', '') from 1 for 12))
where public_id is null;

alter table products
  alter column public_id set not null;

create unique index if not exists products_public_id_uq on products(public_id);
create index if not exists products_is_active_idx on products("isActive");
create index if not exists products_category_idx on products(category);
create index if not exists products_title_search_idx on products(lower(title));
