-- Qaydli phase 0 — core schema.
--
-- Money rule: every stored amount that feeds the books is an INTEGER number of
-- Iraqi dinars (bigint), because IQD has no minor unit in practice. Alongside
-- each we keep original_amount (numeric, as written on the document) and
-- original_currency (IQD | USD | mixed) so we never lose what the owner saw.
--
-- Tenancy rule: every business-owned row carries business_id and Row-Level
-- Security restricts it to the caller's own business. See current_business_id().

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text,
  base_currency text not null default 'IQD',
  usd_iqd_rate  numeric not null default 1310 check (usd_iqd_rate > 0),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- users — app profile, one row per auth.users row, linked to one business.
-- (Entity "user" in the spec; named plural to avoid the SQL reserved word.)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  full_name   text,
  email       text,
  phone       text,
  role        text not null default 'owner' check (role in ('owner', 'staff')),
  created_at  timestamptz not null default now()
);
create index if not exists users_business_id_idx on public.users (business_id);

-- ---------------------------------------------------------------------------
-- Helper: the caller's business id, read with definer rights so table policies
-- can call it without recursing into users' own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.users where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- contacts — vendors and customers.
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  phone       text,
  kind        text not null default 'vendor' check (kind in ('vendor', 'customer', 'both')),
  created_at  timestamptz not null default now()
);
create index if not exists contacts_business_id_idx on public.contacts (business_id);

-- ---------------------------------------------------------------------------
-- documents — one scanned image and its extraction result.
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  uploaded_by   uuid references public.users (id) on delete set null,
  storage_path  text not null,
  document_type text check (document_type in
                  ('invoice', 'receipt', 'payment_receipt', 'voucher', 'unknown')),
  status        text not null default 'extracted'
                  check (status in ('uploaded', 'extracted', 'reviewed', 'failed')),
  extraction    jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists documents_business_id_idx on public.documents (business_id);

-- ---------------------------------------------------------------------------
-- transactions — ledger entries (money in or out).
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  document_id       uuid references public.documents (id) on delete set null,
  contact_id        uuid references public.contacts (id) on delete set null,
  direction         text not null check (direction in ('in', 'out')),
  amount            bigint not null,            -- integer IQD (base currency)
  original_amount   numeric,                    -- as written on the document
  original_currency text default 'IQD' check (original_currency in ('IQD', 'USD', 'mixed')),
  kind              text,                       -- sale | purchase | expense | payment | ...
  occurred_on       date,
  notes             text,
  created_at        timestamptz not null default now()
);
create index if not exists transactions_business_id_idx on public.transactions (business_id);

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  document_id       uuid references public.documents (id) on delete set null,
  contact_id        uuid references public.contacts (id) on delete set null,
  invoice_number    text,
  issue_date        date,
  subtotal          bigint,                     -- integer IQD
  discount          bigint default 0,           -- integer IQD
  total             bigint,                     -- integer IQD
  original_amount   numeric,
  original_currency text default 'IQD' check (original_currency in ('IQD', 'USD', 'mixed')),
  status            text not null default 'open'
                      check (status in ('open', 'partial', 'paid', 'void')),
  created_at        timestamptz not null default now()
);
create index if not exists invoices_business_id_idx on public.invoices (business_id);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  invoice_id        uuid references public.invoices (id) on delete set null,
  contact_id        uuid references public.contacts (id) on delete set null,
  document_id       uuid references public.documents (id) on delete set null,
  amount            bigint not null,            -- integer IQD
  original_amount   numeric,
  original_currency text default 'IQD' check (original_currency in ('IQD', 'USD', 'mixed')),
  method            text,                       -- cash | card | transfer | ...
  paid_on           date,
  created_at        timestamptz not null default now()
);
create index if not exists payments_business_id_idx on public.payments (business_id);

-- ---------------------------------------------------------------------------
-- Onboarding RPC: create a business and link the caller in one step. Runs with
-- definer rights so it can insert regardless of the tables' RLS.
-- ---------------------------------------------------------------------------
create or replace function public.onboard_business(
  p_name text,
  p_city text,
  p_base_currency text default 'IQD',
  p_usd_rate numeric default 1310
)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.businesses;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.businesses (name, city, base_currency, usd_iqd_rate)
  values (p_name, nullif(p_city, ''), coalesce(nullif(p_base_currency, ''), 'IQD'),
          coalesce(p_usd_rate, 1310))
  returning * into b;

  insert into public.users (id, business_id, email, phone, role)
  values (
    auth.uid(),
    b.id,
    (select email from auth.users where id = auth.uid()),
    (select phone from auth.users where id = auth.uid()),
    'owner'
  )
  on conflict (id) do update set business_id = excluded.business_id;

  return b;
end;
$$;

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table public.businesses   enable row level security;
alter table public.users        enable row level security;
alter table public.contacts     enable row level security;
alter table public.documents    enable row level security;
alter table public.transactions enable row level security;
alter table public.invoices     enable row level security;
alter table public.payments     enable row level security;

-- businesses: caller sees and edits only their own business.
create policy businesses_select on public.businesses
  for select using (id = public.current_business_id());
create policy businesses_update on public.businesses
  for update using (id = public.current_business_id())
  with check (id = public.current_business_id());

-- users: see teammates in the same business or your own row; edit your own row.
create policy users_select on public.users
  for select using (id = auth.uid() or business_id = public.current_business_id());
create policy users_insert on public.users
  for insert with check (id = auth.uid());
create policy users_update on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Business-scoped tables: one policy each, same shape.
create policy contacts_all on public.contacts
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy documents_all on public.documents
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy transactions_all on public.transactions
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy invoices_all on public.invoices
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy payments_all on public.payments
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
