# Qaydli — project guide (phase 0)

Qaydli is a **phone-first finance app for SMEs in Iraq and the Kurdistan
Region**. An owner photographs a receipt or invoice; the app extracts the data,
**checks the maths in code**, and keeps the books in **IQD with USD alongside**.

- **Stack:** Next.js (App Router, TypeScript), Supabase (Postgres, Auth,
  Storage), Vercel.
- **UX:** PWA, mobile-first, **RTL-ready** for Arabic and Kurdish (Sorani),
  English default.
- **Money:** base currency **IQD**; a per-business `USD → IQD` rate shows USD
  alongside. Book amounts are **integers in IQD**; each keeps `original_amount`
  and `original_currency` so the original is never lost.

## The one rule that must not bend

**The extraction engine in `/lib/engine` is a PURE function.**

```ts
extract(imageBase64: string, opts?: ExtractOptions): Promise<ReceiptResult>
```

- No database calls, no Storage calls, no reading of app state or cookies.
- Its only contact with the outside world is a **`ProviderAdapter`** (an OpenAI
  vision adapter ships; an Anthropic **stub** is included; tests inject a mock).
- The **maths are checked in code**, not by the model (`lib/engine/checker.ts`).
- Anything that touches Supabase (upload, persistence, auth) lives in the API
  route / server code — **never** in the engine.

If you are tempted to add a fetch to the DB, a rate lookup, or a Storage write
inside `/lib/engine`, stop: do it in `app/api/scan/route.ts` or another server
module and pass what the engine needs through `opts`.

## Layout

```
app/
  layout.tsx            Root layout; LocaleProvider sets <html dir/lang>, registers the SW
  page.tsx              Redirects to /scan
  login/page.tsx        Email+password and phone-OTP sign in (Supabase Auth)
  onboarding/page.tsx   Guard -> OnboardingForm (one-screen business setup)
  scan/page.tsx         Guard -> ScanClient (minimal upload page)
  api/scan/route.ts     POST: store image -> extract() -> persist -> ReceiptResult
components/             LocaleProvider, LanguageSwitcher, ScanClient, OnboardingForm, ServiceWorker
lib/
  i18n.ts               en (default), ar, ckb dictionaries + dir()
  session.ts            getSessionContext() — user + business on the server
  supabase/             browser client, server client, service client, middleware
  engine/               THE PURE ENGINE (see below)
supabase/migrations/    0001_init.sql (schema + RLS), 0002_storage.sql (bucket)
tests/                  run-engine.ts harness + receipts/expected.json
public/                 manifest.webmanifest, sw.js
```

### Engine internals (`lib/engine/`)

- `types.ts` — `ReceiptResult` and the `ProviderAdapter` interface.
- `prompt.ts` — the region-aware vision prompt.
- `schema.ts` — tolerant normalisation of raw model JSON (digit conversion,
  number/currency coercion).
- `providers/openai.ts` — OpenAI vision adapter (structured JSON).
- `providers/anthropic.ts` — Anthropic stub (interface wired, throws for now).
- `checker.ts` — the in-code maths checker.
- `index.ts` — `extract()` = adapter → `runChecks()`.

## Data model

Every business-owned table has `business_id` and **Row-Level Security** scoping
rows to the caller's business via `current_business_id()`. Book amounts are
`bigint` **IQD**; `original_amount` / `original_currency` sit alongside.

| Table          | Purpose                                             | Money columns |
|----------------|-----------------------------------------------------|---------------|
| `businesses`   | Tenant. `base_currency`, `usd_iqd_rate`.            | —             |
| `users`        | App profile, 1:1 with `auth.users`, one business.   | —             |
| `contacts`     | Vendors / customers.                                | —             |
| `documents`    | One scanned image + its `extraction` (jsonb).       | —             |
| `transactions` | Ledger entries (`direction` in/out).                | `amount`, `original_amount`, `original_currency` |
| `invoices`     | `invoice_number`, `subtotal`, `discount`, `total`.  | integer IQD + original |
| `payments`     | Payments against invoices/contacts.                 | `amount` + original |

Onboarding uses the `onboard_business(name, city, base_currency, usd_rate)` RPC,
which creates the business and links the caller in one step. Images live in the
private **`documents`** Storage bucket, keyed `"<business_id>/<file>"`.

## ReceiptResult (what the engine returns)

Each scalar field is `{ value, confidence }` (confidence 0–1). Amounts are
returned **as written**, in the currency named by `currency` (conversion to IQD
is downstream, not the engine's job).

`document_type` (invoice | receipt | payment_receipt | voucher | unknown),
`vendor`, `vendor_latin` (Latin transliteration), `vendor_phone`,
`invoice_number`, `date_raw` (as written, digits/script preserved), `date`
(ISO, **parsed in code** from `date_raw` — see below), `currency`
(IQD | USD | mixed), `line_items[]` (`description`, `qty`, `unit_price`,
`line_total`), `subtotal`, `discount`, `total`, `paid_amount`, `paid_currency`,
`remaining`, `payment_method`, `language`, `notes`, `flags[]`, and `model_used`
(which model produced the result — engine-set, not from the model).

**Dates are parsed in code** (`lib/engine/date.ts`), not trusted to the model:
the model copies the date verbatim into `date_raw`, and `applyDateFromRaw`
derives ISO `date` from it (DD/MM order; a missing year is filled from
`opts.now` and flagged `date_year_missing`).

**Model escalation** (`extractWithEscalation`): run the primary model
(`gpt-4o`) first; if it raises any warn/error flag or any populated money field
has confidence < 0.8, re-run with the secondary model (`gpt-5.6-sol`) and take
that. The vision model is also selectable via `OPENAI_MODEL` (default `gpt-4o`);
GPT-5/o-series reasoning models run without a custom temperature.

The prompt is built to handle: Arabic-Indic digits, handwritten Kurdish/Arabic,
struck-through currency headers, crossed-out lines (ignored), amounts in words,
rotated photos, "paid in full" notes, and **IQD paid against a USD price**
(`currency: "mixed"`).

### Maths checker (in code)

- Line items tried **both** ways — `unit_price × qty` and summed `line_total` —
  pass if **either** is within **1%** of the subtotal/total.
- `subtotal − discount = total` checked within 1%.
- Total cross-checked against an **amount-in-words** (English parsed in code;
  Arabic/Kurdish reconciled by the model and surfaced via `notes`/`flags`).
- **Conflicts are flagged, not guessed** (e.g. `$10` and `15,000 IQD` both
  present → `currency_conflict`).
- Any failed check **downgrades the affected fields' confidence** and adds a
  flag.

## Environment

Read from `.env.local` (never commit secrets); see `.env.example`:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (optional),
`BASE_CURRENCY=IQD`, `USD_IQD_RATE=1310`.

## Commands

```bash
npm run dev          # local dev
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run test:engine  # per-field accuracy table over tests/receipts/
```

## Working agreements

- Keep the engine pure (see the rule above). DB/Storage/auth stay server-side.
- Money is integer IQD in the books; keep `original_amount`/`original_currency`.
- RTL and the three locales are first-class — add UI strings to `lib/i18n.ts`.
- Every business-owned table needs `business_id` **and** an RLS policy.
- Commit in small, clearly described steps.
