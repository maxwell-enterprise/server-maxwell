-- Per-product VAT/PPN rate (0–100). Applied to list price (base `priceIdr` / variant prices) at checkout.
alter table if exists products
  add column if not exists "ppnRatePercent" numeric(6, 2) not null default 0;

comment on column products."ppnRatePercent" is 'PPN/VAT percent (0–100) on top of list price before global checkout tax.';
