# Supabase

Migrations for Qaydli's Postgres schema, Storage bucket, and Row-Level Security.

## Apply

With the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project:

```bash
supabase db push
```

Or paste each file in `migrations/` (in order) into the SQL editor of your
Supabase project.

## What's here

- `0001_init.sql` — tables (`businesses`, `users`, `contacts`, `documents`,
  `transactions`, `invoices`, `payments`), the `onboard_business` RPC, and RLS
  policies scoping every business-owned row to the caller's `business_id`.
- `0002_storage.sql` — the private `documents` bucket and its per-business
  Storage policies (objects are keyed `"<business_id>/<file>"`).

## Money & tenancy conventions

- Book amounts are **integer IQD** (`bigint`). Each carries `original_amount`
  and `original_currency` (`IQD | USD | mixed`) so the original is never lost.
- Every business-owned table has `business_id` and RLS. `current_business_id()`
  resolves the caller's business from the `users` table with definer rights.
