-- Automation trigger catalog for admin UI (Select Trigger) — source of truth for dropdowns when using Nest API.
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
