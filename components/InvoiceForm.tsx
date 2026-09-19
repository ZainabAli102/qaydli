'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ScanLine, PencilLine, Plus, Trash2, ArrowLeftRight, Check } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { compressImage } from '@/lib/image-client';
import { computeTotals, dueDateFrom, type InvoiceCurrency } from '@/lib/invoices';
import { formatMoney } from '@/lib/money';
import { receiptToDraft } from '@/lib/invoice-from-receipt';
import type { ParsedInvoiceDraft } from '@/lib/invoice-parse';
import type { ClientRow } from '@/lib/invoice-queries';
import { createInvoice, type CreateInvoiceInput } from '@/app/(app)/invoices/new/actions';

type Source = 'manual' | 'describe' | 'scan';
type DueMode = '7' | '14' | '30' | 'custom' | 'none';
interface ItemRow {
  description: string;
  qty: string;
  unit_price: string;
}

const emptyItem = (): ItemRow => ({ description: '', qty: '1', unit_price: '' });

export function InvoiceForm(props: {
  clients: ClientRow[];
  usdIqdRate: number;
  today: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<Source>('manual');

  // client
  const [clientId, setClientId] = useState<string>(props.clients[0]?.id ?? '');
  const [adding, setAdding] = useState(props.clients.length === 0);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // items + money
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [currency, setCurrency] = useState<InvoiceCurrency>('IQD');
  const [discount, setDiscount] = useState('');
  const [issueDate, setIssueDate] = useState(props.today);
  const [dueMode, setDueMode] = useState<DueMode>('14');
  const [dueDate, setDueDate] = useState(dueDateFrom(props.today, 14));
  const [notes, setNotes] = useState('');

  // describe / scan / submit
  const [describeText, setDescribeText] = useState('');
  const [busy, setBusy] = useState<null | 'describe' | 'scan' | 'submit'>(null);
  const [error, setError] = useState<string | null>(null);

  const numItems = useMemo(
    () => items.map((it) => ({ qty: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })),
    [items]
  );
  const totals = useMemo(() => computeTotals(numItems, Number(discount) || 0), [numItems, discount]);

  function setItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(i: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function chooseDue(mode: DueMode) {
    setDueMode(mode);
    if (mode === 'none') return;
    if (mode === 'custom') return;
    setDueDate(dueDateFrom(issueDate, Number(mode)));
  }

  // Apply a draft (from Describe or Scan) onto the editable form.
  function applyDraft(d: ParsedInvoiceDraft) {
    if (d.items.length) {
      setItems(
        d.items.map((it) => ({
          description: it.description,
          qty: String(it.qty || 1),
          unit_price: it.unit_price ? String(it.unit_price) : '',
        }))
      );
    }
    if (d.currency) setCurrency(d.currency);
    if (d.notes) setNotes(d.notes);
    if (d.client_name && !clientId) {
      setAdding(true);
      setNewName(d.client_name);
    }
    if (d.due_date) {
      setDueMode('custom');
      setDueDate(d.due_date);
    } else if (d.due_in_days) {
      setDueMode(([7, 14, 30].includes(d.due_in_days) ? String(d.due_in_days) : 'custom') as DueMode);
      setDueDate(dueDateFrom(issueDate, d.due_in_days));
    }
    setSource('manual'); // drop the owner into the editable form to check
  }

  async function runDescribe() {
    if (describeText.trim().length < 3) return;
    setBusy('describe');
    setError(null);
    try {
      const res = await fetch('/api/invoices/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: describeText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('inv.describeFailed'));
      applyDraft(data.draft as ParsedInvoiceDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('inv.describeFailed'));
    } finally {
      setBusy(null);
    }
  }

  const [documentId, setDocumentId] = useState<string | null>(null);
  async function runScan(file: File) {
    setBusy('scan');
    setError(null);
    try {
      const img = await compressImage(file);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: img.base64, mimeType: img.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('scan.failed'));
      setDocumentId(data.document_id ?? null);
      applyDraft(receiptToDraft(data.result));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('scan.failed'));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setError(null);
    if (!clientId && !(adding && newName.trim())) {
      setError(t('inv.noClient'));
      return;
    }
    const cleanItems = items
      .map((it) => ({
        description: it.description.trim(),
        qty: Number(it.qty) || 0,
        unit_price: Number(it.unit_price) || 0,
      }))
      .filter((it) => it.description !== '' || it.unit_price > 0);
    if (cleanItems.length === 0) {
      setError(t('inv.noItems'));
      return;
    }

    const input: CreateInvoiceInput = {
      clientId: adding ? null : clientId || null,
      newClient: adding ? { name: newName, phone: newPhone, email: newEmail, address: newAddress } : null,
      items: cleanItems,
      currency,
      discount: Number(discount) || 0,
      issueDate,
      dueDate: dueMode === 'none' ? null : dueDate,
      notes,
      documentId,
    };

    setBusy('submit');
    const res = await createInvoice(input);
    // On success the action redirects; only errors return here.
    setBusy(null);
    if (res && 'error' in res) {
      if (res.error === 'limit') {
        router.push('/upgrade');
        return;
      }
      setError('message' in res ? res.message : t('inv.describeFailed'));
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">{t('inv.new')}</h1>
        <button onClick={() => router.push('/invoices')} className="text-sm text-brand">
          {t('inv.title')}
        </button>
      </header>

      {/* Source picker: fill in / describe / scan */}
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {([
          ['manual', PencilLine, t('inv.wayManual')],
          ['describe', Sparkles, t('inv.wayDescribe')],
          ['scan', ScanLine, t('inv.wayScan')],
        ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setSource(key)}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 font-medium ${
              source === key ? 'bg-white text-brand shadow-sm' : 'text-slate-500'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {source === 'describe' && (
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-3">
          <textarea
            value={describeText}
            onChange={(e) => setDescribeText(e.target.value)}
            rows={3}
            placeholder={t('inv.describePlaceholder')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">{t('inv.describeHint')}</p>
          <button
            onClick={runDescribe}
            disabled={busy === 'describe'}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Sparkles size={16} /> {busy === 'describe' ? t('inv.describing') : t('inv.describeBtn')}
          </button>
        </div>
      )}

      {source === 'scan' && (
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-3 text-center">
          <p className="mb-2 text-sm text-slate-600">{t('inv.scanHint')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runScan(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'scan'}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <ScanLine size={16} /> {busy === 'scan' ? t('inv.scanReading') : t('inv.wayScan')}
          </button>
        </div>
      )}

      {/* --- The editable invoice --- */}
      <div className="space-y-5">
        {/* Client */}
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{t('inv.client')}</span>
            {props.clients.length > 0 && (
              <button onClick={() => setAdding((a) => !a)} className="flex items-center gap-1 text-xs font-medium text-brand">
                <Plus size={14} /> {adding ? t('inv.pickClient') : t('inv.addClient')}
              </button>
            )}
          </div>
          {adding ? (
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('inv.clientName')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder={t('inv.clientPhone')}
                  inputMode="tel"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
                />
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={t('inv.clientEmail')}
                  inputMode="email"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
                />
              </div>
              <input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder={t('inv.clientAddress')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
              />
            </div>
          ) : (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base focus:border-brand focus:outline-none"
            >
              {props.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </section>

        {/* Currency */}
        <section className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">{t('inv.currency')}</span>
          <button
            onClick={() => setCurrency((c) => (c === 'IQD' ? 'USD' : 'IQD'))}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            {currency} <ArrowLeftRight size={14} />
          </button>
        </section>

        {/* Items */}
        <section>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t('inv.items')}</span>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={it.description}
                    onChange={(e) => setItem(i, { description: e.target.value })}
                    placeholder={t('inv.itemDesc')}
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-base focus:border-brand focus:outline-none"
                  />
                  <button
                    onClick={() => removeItem(i)}
                    aria-label={t('delete')}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-slate-500">
                    {t('inv.qty')}
                    <input
                      value={it.qty}
                      onChange={(e) => setItem(i, { qty: e.target.value })}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-base focus:border-brand focus:outline-none"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    {t('inv.unitPrice')}
                    <input
                      value={it.unit_price}
                      onChange={(e) => setItem(i, { unit_price: e.target.value })}
                      inputMode="decimal"
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-base focus:border-brand focus:outline-none"
                    />
                  </label>
                  <div className="text-xs text-slate-500">
                    {t('inv.lineTotal')}
                    <div className="mt-0.5 truncate py-1.5 font-medium text-slate-700">
                      {formatMoney((Number(it.qty) || 0) * (Number(it.unit_price) || 0), currency)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="mt-2 flex items-center gap-1 text-sm font-medium text-brand">
            <Plus size={16} /> {t('inv.addItem')}
          </button>
        </section>

        {/* Discount + totals */}
        <section className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-slate-600">{t('inv.subtotal')}</span>
            <span className="font-medium text-slate-800">{formatMoney(totals.subtotal, currency)}</span>
          </div>
          <label className="mb-2 flex items-center justify-between gap-2">
            <span className="text-slate-600">{t('inv.discount')}</span>
            <input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="w-28 rounded-md border border-slate-300 px-2 py-1 text-end text-base focus:border-brand focus:outline-none"
            />
          </label>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-base">
            <span className="font-semibold text-slate-700">{t('inv.total')}</span>
            <span className="font-bold text-brand">{formatMoney(totals.total, currency)}</span>
          </div>
        </section>

        {/* Dates */}
        <section className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{t('inv.issueDate')}</span>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value);
                if (dueMode !== 'custom' && dueMode !== 'none') setDueDate(dueDateFrom(e.target.value, Number(dueMode)));
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-700">{t('inv.dueIn')}</span>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['7', t('inv.days7')],
                ['14', t('inv.days14')],
                ['30', t('inv.days30')],
                ['custom', t('inv.dueCustom')],
                ['none', '—'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => chooseDue(mode)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    dueMode === mode ? 'bg-brand text-white' : 'border border-slate-300 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {dueMode === 'custom' && (
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
              />
            )}
          </div>
        </section>

        {/* Notes */}
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">{t('inv.notes')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
          />
        </label>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={busy === 'submit'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
        >
          <Check size={18} /> {busy === 'submit' ? t('inv.creating') : t('inv.confirm')}
        </button>
      </div>
    </main>
  );
}
