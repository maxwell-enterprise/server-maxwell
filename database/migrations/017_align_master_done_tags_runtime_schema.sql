alter table if exists master_done_tags
  add column if not exists category text not null default 'CORE';
