-- Qaydli phase 2 — invoices (money in).
--
-- Money note: unlike the books (integer IQD), an invoice is kept in ITS OWN
-- currency (IQD or USD) exactly as the owner bills it, so USD invoices keep
-- their cents. Each invoice stores the usd_iqd_rate in force when it was made,
-- so recording a payment can convert to integer IQD for the ledger without a
-- later rate change rewriting history. Item/subtotal/discount/total are numeric
-- in the invoice currency; the transaction created on payment is integer IQD.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- businesses: invoicing settings (used on the PDF and public invoice page).
-- invoice_seq is the last invoice number issued for this business (per-business
-- auto-increment: INV-001, INV-002, …).
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists phone                text,
  add column if not exists address              text,
  add column if not exists logo_path            text, -- key in the 'documents' bucket
  add column if not exists payment_instructions text,
  add column if not exists invoice_seq          integer not null default 0;

-- ---------------------------------------------------------------------------
-- clients — the people/organisations you invoice (distinct from vendor contacts).
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists clients_business_id_idx on public.clients (business_id);

-- ---------------------------------------------------------------------------
-- invoices. The phase-0 invoices/payments tables were placeholders never used
-- by app code (verified: no reads/writes anywhere), so we drop and rebuild them
-- to the phase-2 shape rather than bolt columns on.
-- ---------------------------------------------------------------------------
drop table if exists public.payments cascade;
drop table if exists public.invoices cascade;

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  client_id     uuid references public.clients (id) on delete set null,
  document_id   uuid references public.documents (id) on delete set null, -- scan origin
  seq           integer not null,             -- numeric part, per business
  number        text not null,                -- 'INV-001'
  items         jsonb not null default '[]',  -- [{ description, qty, unit_price }]
  currency      text not null default 'IQD' check (currency in ('IQD', 'USD')),
  usd_iqd_rate  numeric not null,             -- rate in force when issued
  subtotal      numeric not null default 0,   -- in invoice currency
  discount      numeric not null default 0,
  total         numeric not null default 0,
  issue_date    date not null,
  due_date      date,
  -- Stored base status. 'overdue' is DERIVED on read (unpaid + past due) from
  -- sent/partial, never persisted, so it stays correct as days pass.
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'partial', 'paid')),
  notes         text,
  public_token  text unique,                  -- capability for /i/<token>
  pdf_path      text,                          -- key in the 'documents' bucket
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists invoices_business_id_idx on public.invoices (business_id);
create index if not exists invoices_status_idx on public.invoices (business_id, status);
create unique index if not exists invoices_business_number_idx
  on public.invoices (business_id, number);

-- ---------------------------------------------------------------------------
-- invoice_payments — payments recorded against an invoice.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  invoice_id    uuid not null references public.invoices (id) on delete cascade,
  amount        numeric not null,             -- in invoice currency
  currency      text not null default 'IQD' check (currency in ('IQD', 'USD')),
  paid_on       date not null,
  method        text,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id);
create index if not exists invoice_payments_business_idx
  on public.invoice_payments (business_id);

-- transactions gain an invoice link so the money-in entry a payment creates can
-- be tied back to its invoice — and excluded from the free-trial entry count
-- (the invoice itself already counts).
alter table public.transactions
  add column if not exists invoice_id uuid references public.invoices (id) on delete set null;
create index if not exists transactions_invoice_idx on public.transactions (invoice_id);

-- ---------------------------------------------------------------------------
-- next_invoice_number — atomically claim the next per-business invoice number.
-- Runs with definer rights so the single UPDATE is race-safe across concurrent
-- creates; each caller gets a distinct seq. Scoped to the caller's business.
-- ---------------------------------------------------------------------------
create or replace function public.next_invoice_number()
returns table (seq integer, number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  b_id uuid := public.current_business_id();
  n integer;
begin
  if b_id is null then
    raise exception 'no business for caller';
  end if;
  update public.businesses
     set invoice_seq = invoice_seq + 1
   where id = b_id
  returning invoice_seq into n;
  seq := n;
  number := 'INV-' || lpad(n::text, 3, '0');
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_invoice_payment — insert a payment, create the matching money-in
-- ledger transaction (category 'sales', integer IQD via the invoice's stored
-- rate), and re-derive the invoice status, all in one transaction.
-- ---------------------------------------------------------------------------
create or replace function public.record_invoice_payment(
  p_invoice uuid,
  p_amount  numeric,
  p_date    date,
  p_method  text default null,
  p_note    text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  b_id uuid := public.current_business_id();
  inv public.invoices;
  cli_name text;
  paid numeric;
  amount_iqd bigint;
  new_status text;
begin
  if b_id is null then
    raise exception 'no business for caller';
  end if;

  select * into inv from public.invoices
   where id = p_invoice and business_id = b_id
   for update;
  if not found then
    raise exception 'invoice not found';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  insert into public.invoice_payments
    (business_id, invoice_id, amount, currency, paid_on, method, note)
  values
    (b_id, inv.id, p_amount, inv.currency, coalesce(p_date, current_date), p_method, p_note);

  -- Ledger money-in, in integer IQD. USD invoices convert at the stored rate.
  amount_iqd := round(case when inv.currency = 'USD'
                           then p_amount * inv.usd_iqd_rate
                           else p_amount end);
  select name into cli_name from public.clients where id = inv.client_id;

  insert into public.transactions
    (business_id, invoice_id, contact_id, direction, amount,
     original_amount, original_currency, category, vendor, occurred_on, kind, notes)
  values
    (b_id, inv.id, null, 'in', amount_iqd,
     p_amount, inv.currency, 'sales', cli_name, coalesce(p_date, current_date),
     'payment', 'Payment for ' || inv.number);

  select coalesce(sum(amount), 0) into paid
    from public.invoice_payments where invoice_id = inv.id;

  -- Derive stored status: paid >= total -> paid; some paid -> partial;
  -- otherwise keep sent if it was sent, else draft. (overdue is derived on read)
  if inv.total > 0 and paid >= inv.total then
    new_status := 'paid';
  elsif paid > 0 then
    new_status := 'partial';
  elsif inv.sent_at is not null then
    new_status := 'sent';
  else
    new_status := 'draft';
  end if;

  update public.invoices
     set status = new_status, updated_at = now()
   where id = inv.id
  returning * into inv;

  return inv;
end;
$$;

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table public.clients          enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_payments enable row level security;

create policy clients_all on public.clients
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy invoices_all on public.invoices
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy invoice_payments_all on public.invoice_payments
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
