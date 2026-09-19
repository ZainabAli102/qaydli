-- Qaydli — Insights: owner overrides for recurring detection, and a cache for
-- the plain-language monthly summary (per business, per month, per language).

-- Owner marks/unmarks a detected group (vendor or category) as recurring.
create table if not exists public.recurring_marks (
  business_id  uuid not null references public.businesses (id) on delete cascade,
  group_key    text not null,        -- e.g. 'v:mvk electric' or 'c:rent'
  is_recurring boolean not null,
  updated_at   timestamptz not null default now(),
  primary key (business_id, group_key)
);

-- Cached summary. `signature` fingerprints the month's transactions so we
-- regenerate only when they change.
create table if not exists public.insight_summaries (
  business_id uuid not null references public.businesses (id) on delete cascade,
  month       text not null,         -- 'YYYY-MM'
  lang        text not null,         -- 'en' | 'ar' | 'ckb'
  summary     text not null,
  signature   text not null,
  created_at  timestamptz not null default now(),
  primary key (business_id, month, lang)
);

alter table public.recurring_marks    enable row level security;
alter table public.insight_summaries  enable row level security;

create policy recurring_marks_all on public.recurring_marks
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

create policy insight_summaries_all on public.insight_summaries
  for all using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());
