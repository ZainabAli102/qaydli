-- Qaydli phase 2 — "Invoice look": branding fields shown on the PDF and the
-- public invoice link. phone, address, logo_path and payment_instructions were
-- added in 0006; this adds the rest.

alter table public.businesses
  add column if not exists email          text,
  add column if not exists tax_number     text,          -- tax / registration no.
  add column if not exists accent_color   text not null default '#0f766e', -- brand teal
  add column if not exists invoice_footer text;          -- footer note / terms / thanks
