-- Qaydli phase 1 — owner-facing app: categories, payment method, vendor memory,
-- and keeping the owner's corrections alongside the raw extraction.

-- transactions: expense/income category, payment method, and the vendor name
-- (denormalised for fast "same vendor last time" memory). direction stays the
-- ledger truth: 'out' = expense, 'in' = income.
alter table public.transactions
  add column if not exists category       text,
  add column if not exists payment_method text,
  add column if not exists vendor         text;

create index if not exists transactions_vendor_idx
  on public.transactions (business_id, vendor);
create index if not exists transactions_occurred_on_idx
  on public.transactions (business_id, occurred_on);

-- documents: keep the owner's reviewed/corrected values next to `extraction`
-- (the raw ReceiptResult), so we can measure and learn from corrections later.
alter table public.documents
  add column if not exists corrections jsonb;

-- Vendor memory: the most recent category + payment method the owner used for a
-- given vendor in their business. SECURITY INVOKER so RLS still scopes rows.
create or replace function public.vendor_memory(p_vendor text)
returns table (category text, payment_method text)
language sql
stable
as $$
  select t.category, t.payment_method
  from public.transactions t
  where t.business_id = public.current_business_id()
    and t.vendor is not null
    and lower(t.vendor) = lower(p_vendor)
    and (t.category is not null or t.payment_method is not null)
  order by t.created_at desc
  limit 1
$$;
