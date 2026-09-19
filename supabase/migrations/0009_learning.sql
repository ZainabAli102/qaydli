-- Qaydli — learning loop, phase A. Capture the owner's corrections to the AI's
-- suggestions, and build small per-business memories (client aliases, item
-- phrases, category vocabulary) so the next entry needs fewer corrections.
-- No model training here — everything stays in Supabase, RLS-scoped.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- corrections — one row per field the owner changed away from the AI value.
-- ---------------------------------------------------------------------------
create table if not exists public.corrections (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  source       text not null check (source in ('scan', 'describe', 'voice', 'manual')),
  field        text not null,          -- e.g. vendor, category, total, currency
  ai_value     text,                   -- what the AI/prefill suggested
  final_value  text,                   -- what the owner saved
  language     text,                   -- UI language at the time (en|ar|ckb)
  model_used   text,                   -- model/provider that produced ai_value
  created_at   timestamptz not null default now()
);
create index if not exists corrections_business_created_idx
  on public.corrections (business_id, created_at);
create index if not exists corrections_field_idx on public.corrections (business_id, field);

-- ---------------------------------------------------------------------------
-- client_aliases — a spoken/typed spelling → a real client.
-- ---------------------------------------------------------------------------
create table if not exists public.client_aliases (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  alias_norm  text not null,           -- normalized alias (see lib/memory.ts)
  client_id   uuid not null references public.clients (id) on delete cascade,
  uses        integer not null default 1,
  updated_at  timestamptz not null default now(),
  unique (business_id, alias_norm)
);
create index if not exists client_aliases_business_idx on public.client_aliases (business_id);

-- ---------------------------------------------------------------------------
-- item_phrases — description + unit price memory ("training day" = 250,000).
-- ---------------------------------------------------------------------------
create table if not exists public.item_phrases (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phrase_norm text not null,           -- normalized item description
  description text not null,           -- last display description
  unit_price  numeric not null,        -- last unit price
  uses        integer not null default 1,
  updated_at  timestamptz not null default now(),
  unique (business_id, phrase_norm)
);
create index if not exists item_phrases_business_idx on public.item_phrases (business_id);

-- ---------------------------------------------------------------------------
-- category_vocab — the owner's own words → a category slug.
-- ---------------------------------------------------------------------------
create table if not exists public.category_vocab (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phrase_norm text not null,           -- normalized vendor/phrase
  category    text not null,           -- category slug
  uses        integer not null default 1,
  updated_at  timestamptz not null default now(),
  unique (business_id, phrase_norm)
);
create index if not exists category_vocab_business_idx on public.category_vocab (business_id);

-- ---------------------------------------------------------------------------
-- Upsert RPCs (definer, scoped to the caller's business) that increment `uses`
-- on conflict. business_id is set internally so callers can't spoof it.
-- ---------------------------------------------------------------------------
create or replace function public.learn_client_alias(p_alias text, p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := public.current_business_id();
begin
  if b is null or coalesce(trim(p_alias), '') = '' or p_client is null then return; end if;
  insert into public.client_aliases (business_id, alias_norm, client_id)
  values (b, p_alias, p_client)
  on conflict (business_id, alias_norm)
  do update set client_id = excluded.client_id, uses = public.client_aliases.uses + 1, updated_at = now();
end; $$;

create or replace function public.learn_item_phrase(p_phrase text, p_desc text, p_price numeric)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := public.current_business_id();
begin
  if b is null or coalesce(trim(p_phrase), '') = '' or p_price is null or p_price <= 0 then return; end if;
  insert into public.item_phrases (business_id, phrase_norm, description, unit_price)
  values (b, p_phrase, coalesce(nullif(trim(p_desc), ''), p_phrase), p_price)
  on conflict (business_id, phrase_norm)
  do update set description = excluded.description, unit_price = excluded.unit_price,
                uses = public.item_phrases.uses + 1, updated_at = now();
end; $$;

create or replace function public.learn_category_vocab(p_phrase text, p_category text)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid := public.current_business_id();
begin
  if b is null or coalesce(trim(p_phrase), '') = '' or coalesce(trim(p_category), '') = '' then return; end if;
  insert into public.category_vocab (business_id, phrase_norm, category)
  values (b, p_phrase, p_category)
  on conflict (business_id, phrase_norm)
  do update set category = excluded.category, uses = public.category_vocab.uses + 1, updated_at = now();
end; $$;

-- ===========================================================================
-- Row-Level Security — every table scoped to the caller's business.
-- ===========================================================================
alter table public.corrections     enable row level security;
alter table public.client_aliases  enable row level security;
alter table public.item_phrases    enable row level security;
alter table public.category_vocab  enable row level security;

create policy corrections_all on public.corrections
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy client_aliases_all on public.client_aliases
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy item_phrases_all on public.item_phrases
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy category_vocab_all on public.category_vocab
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
