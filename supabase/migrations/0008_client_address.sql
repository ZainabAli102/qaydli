-- Qaydli phase 2 — a client address, shown in the invoice "Bill to" block
-- (PDF and public link) when set.

alter table public.clients
  add column if not exists address text;
