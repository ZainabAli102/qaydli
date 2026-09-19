'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import { CATEGORIES, PAYMENT_METHODS, type Category, type PaymentMethod, type TxnType } from '@/lib/domain';
import { fromIqd, toIqd, formatUsd, formatIqd, type Currency } from '@/lib/money';
import { saveTransaction } from '@/app/(app)/review/[id]/actions';

export interface ReviewLineItem {
  description: string;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
}

export interface ReviewInitial {
  documentId: string;
  imageUrl: string | null;
  usdIqdRate: number;
  vendor: string;
  vendorLatin: string;
  invoiceNumber: string;
  date: string;
  currency: Currency;
  total: number | null;
  paid: number | null;
  remaining: number | null;
  lineItems: ReviewLineItem[];
  notes: string;
  flags: Array<{ code: string; message: string; severity: string }>;
  category: Category;
  paymentMethod: PaymentMethod;
  type: TxnType;
  fromMemory: boolean;
  conf: { vendor: number; date: number; total: number; currency: number };
}

export function ReviewForm({ initial }: { initial: ReviewInitial }) {
  const { t } = useLocale();
  const router = useRouter();
  const isDemo = useSearchParams().get('demo') === '1';
  const rate = initial.usdIqdRate;

  const [vendor, setVendor] = useState(initial.vendor);
  const [invoiceNumber, setInvoiceNumber] = useState(initial.invoiceNumber);
  const [date, setDate] = useState(initial.date);
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [total, setTotal] = useState(initial.total != null ? String(initial.total) : '');
  const [type, setType] = useState<TxnType>(initial.type);
  const [category, setCategory] = useState<Category>(initial.category);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial.paymentMethod);
  const [items, setItems] = useState<ReviewLineItem[]>(initial.lineItems);
  const [notes] = useState(initial.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalNum = parseFloat(total) || 0;
  const equivalent =
    currency === 'IQD'
      ? formatUsd(fromIqd(totalNum, 'USD', rate))
      : formatIqd(toIqd(totalNum, 'USD', rate));

  function switchCurrency() {
    const next: Currency = currency === 'IQD' ? 'USD' : 'IQD';
    const converted =
      currency === 'IQD' ? (rate ? totalNum / rate : 0) : totalNum * rate;
    setTotal(next === 'IQD' ? String(Math.round(converted)) : converted.toFixed(2));
    setCurrency(next);
  }

  function updateItem(i: number, patch: Partial<ReviewLineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addItem() {
    setItems((prev) => [...prev, { description: '', qty: null, unit_price: null, line_total: null }]);
  }

  const problemFlags = initial.flags.filter((f) => f.severity !== 'info');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await saveTransaction({
        documentId: initial.documentId,
        vendor,
        invoiceNumber,
        date,
        currency,
        total: totalNum,
        type,
        category,
        paymentMethod,
        lineItems: items,
        notes,
      });
      if (res?.error === 'limit') {
        router.push('/upgrade');
      } else if (res?.error) {
        setError(res.error);
        setBusy(false);
      }
      // success path: the action redirects to /dashboard.
    } catch (err) {
      // A thrown NEXT_REDIRECT is normal; only surface real errors.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('NEXT_REDIRECT')) {
        setError(msg);
        setBusy(false);
      }
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6 pb-28">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">{t('review.title')}</h1>
        {isDemo && (
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {t('demo.badge')}
          </span>
        )}
      </header>

      {initial.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={initial.imageUrl}
          alt="receipt"
          className="mb-4 max-h-64 w-full rounded-lg border border-slate-200 object-contain"
        />
      )}

      {/* maths note + flags */}
      {problemFlags.length === 0 ? (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✓ {t('review.mathsOk')}</p>
      ) : (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="mb-1 font-medium">{t('review.mathsIssues')}</p>
          <ul className="list-inside list-disc">
            {problemFlags.map((f, i) => (
              <li key={i}>{t(`flag.${f.code}`, f.message)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <Field label={t('review.vendor')} confidence={initial.conf.vendor}>
          <input className={inputCls} value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('review.date')} confidence={initial.conf.date}>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('review.invoiceNumber')}>
            <input className={inputCls} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
        </div>

        {/* total + currency toggle */}
        <Field label={t('review.total')} confidence={initial.conf.total}>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              className={inputCls}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
            <button
              type="button"
              onClick={switchCurrency}
              className="shrink-0 rounded-md border border-brand px-3 py-2 text-sm font-semibold text-brand"
            >
              {currency} ⇄
            </button>
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            {currency === 'IQD' ? t('review.usdEquiv') : t('review.iqdEquiv')}: {equivalent}
          </span>
        </Field>

        {/* type toggle */}
        <div>
          <Label>{t('review.type')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as TxnType[]).map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => setType(ty)}
                className={`rounded-md border px-3 py-2 text-sm font-medium ${
                  type === ty ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {t(`type.${ty}`)}
              </button>
            ))}
          </div>
        </div>

        {/* category */}
        <div>
          <Label>
            {t('review.category')}
            {initial.fromMemory && <span className="ms-2 text-xs text-brand">★</span>}
          </Label>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`cat.${c}`)}
              </option>
            ))}
          </select>
        </div>

        {/* payment method */}
        <div>
          <Label>{t('review.paymentMethod')}</Label>
          <select
            className={inputCls}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHODS.map((p) => (
              <option key={p} value={p}>
                {t(`pay.${p}`)}
              </option>
            ))}
          </select>
        </div>

        {/* line items */}
        <div>
          <Label>{t('review.lineItems')}</Label>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2">
                <input
                  className={`${inputCls} mb-1`}
                  placeholder={t('review.description')}
                  value={it.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                />
                <div className="grid grid-cols-3 gap-1">
                  <NumInput placeholder={t('review.qty')} value={it.qty} onChange={(v) => updateItem(i, { qty: v })} />
                  <NumInput placeholder={t('review.unitPrice')} value={it.unit_price} onChange={(v) => updateItem(i, { unit_price: v })} />
                  <NumInput placeholder={t('review.lineTotal')} value={it.line_total} onChange={(v) => updateItem(i, { line_total: v })} />
                </div>
                <button type="button" onClick={() => removeItem(i)} className="mt-1 text-xs text-red-600">
                  {t('delete')}
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="mt-2 text-sm font-medium text-brand">
            + {t('review.addItem')}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200 bg-white p-3">
        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
        >
          {busy ? t('review.saving') : t('review.save')}
        </button>
      </div>
    </main>
  );
}

const inputCls =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none';

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-sm font-medium text-slate-700">{children}</span>;
}

function Field({
  label,
  confidence,
  children,
}: {
  label: string;
  confidence?: number;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {confidence !== undefined && <ConfidenceChip confidence={confidence} />}
      </span>
      {children}
    </label>
  );
}

function ConfidenceChip({ confidence }: { confidence: number }) {
  const { t } = useLocale();
  const [cls, label] =
    confidence >= 0.9
      ? ['bg-green-100 text-green-700', t('review.confHigh')]
      : confidence >= 0.6
        ? ['bg-amber-100 text-amber-700', t('review.confMed')]
        : ['bg-red-100 text-red-700', t('review.confLow')];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      placeholder={placeholder}
      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}
