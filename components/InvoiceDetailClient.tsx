'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Send,
  MessageCircle,
  Link2,
  FileDown,
  BellRing,
  Check,
  Trash2,
  Clock,
} from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge';
import { interpolate } from '@/lib/i18n';
import { displayStatus, isOverdue, lineTotal } from '@/lib/invoices';
import { formatMoney } from '@/lib/money';
import type { InvoiceDetail } from '@/lib/invoice-queries';
import { recordPayment, markSent, deleteInvoice } from '@/app/(app)/invoices/[id]/actions';

export function InvoiceDetailClient(props: {
  invoice: InvoiceDetail;
  businessName: string;
  today: string;
}) {
  const inv = props.invoice;
  const { t, locale } = useLocale();
  const router = useRouter();

  const balance = Math.max(0, inv.total - inv.paid);
  const display = displayStatus({ status: inv.status, dueDate: inv.due_date, today: props.today });
  const overdue = isOverdue({ status: inv.status, dueDate: inv.due_date, today: props.today });

  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');
  const [payDate, setPayDate] = useState(props.today);
  const [method, setMethod] = useState('cash');
  const [payNote, setPayNote] = useState('');
  const [busy, setBusy] = useState<null | 'pay' | 'sent'>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function publicUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return inv.public_token ? `${origin}/i/${inv.public_token}?lang=${locale}` : origin;
  }
  const pdfUrl = `/api/invoices/${inv.id}/pdf?lang=${locale}`;

  function waLink(template: string): string {
    const msg = interpolate(t(template), {
      client: inv.client_name || '',
      number: inv.number,
      business: props.businessName,
      amount: formatMoney(balance > 0 ? balance : inv.total, inv.currency),
      link: publicUrl(),
    });
    const phone = (inv.client?.phone || '').replace(/\D/g, '');
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    return `${base}?text=${encodeURIComponent(msg)}`;
  }

  async function share() {
    const url = publicUrl();
    const pdf = `${window.location.origin}${pdfUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: inv.number, text: `${inv.number} — ${props.businessName}`, url: pdf });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await copyLink(url);
  }

  async function copyLink(url = publicUrl()) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function pay() {
    setError(null);
    setBusy('pay');
    const res = await recordPayment({
      invoiceId: inv.id,
      amount: Number(amount) || 0,
      date: payDate,
      method,
      note: payNote,
    });
    setBusy(null);
    if ('error' in res) setError(res.error);
    else {
      setPayNote('');
      router.refresh();
    }
  }

  async function doMarkSent() {
    setBusy('sent');
    const res = await markSent(inv.id);
    setBusy(null);
    if ('error' in res) setError(res.error);
    else router.refresh();
  }

  async function doDelete() {
    if (!confirm(t('inv.deleteConfirm'))) return;
    const res = await deleteInvoice(inv.id);
    if (res && 'error' in res) setError(res.error);
  }

  // Reminder template depends on state: overdue vs due-today vs generic.
  const reminderTemplate = overdue
    ? 'inv.waReminderOverdue'
    : inv.due_date === props.today
      ? 'inv.waReminderDue'
      : 'inv.waInvoiceMsg';

  const money = (n: number) => formatMoney(n, inv.currency);

  // Build the timeline (created, sent, each payment), newest last.
  const events: Array<{ label: string; date: string; extra?: string }> = [
    { label: t('inv.tl.created'), date: inv.created_at.slice(0, 10) },
  ];
  if (inv.sent_at) events.push({ label: t('inv.tl.sent'), date: inv.sent_at.slice(0, 10) });
  for (const p of inv.payments)
    events.push({ label: t('inv.tl.payment'), date: p.paid_on, extra: money(p.amount) });

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/invoices" className="inline-flex items-center gap-1 text-sm text-brand">
          <ChevronLeft size={20} className="rtl:-scale-x-100" /> {t('inv.title')}
        </Link>
        <button onClick={doDelete} className="inline-flex items-center gap-1 text-sm text-slate-400">
          <Trash2 size={16} /> {t('delete')}
        </button>
      </div>

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{inv.number}</h1>
          <p className="text-sm text-slate-500">{inv.client_name || '—'}</p>
        </div>
        <InvoiceStatusBadge status={display} />
      </div>

      {/* Amounts */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Amount label={t('inv.total')} value={money(inv.total)} />
        <Amount label={t('inv.paidSoFar')} value={money(inv.paid)} tone="in" />
        <Amount label={t('inv.balance')} value={money(balance)} tone={balance > 0 ? 'out' : 'in'} />
      </div>

      {/* Items */}
      <section className="mb-4 rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-400">
              <th className="p-2 text-start font-medium">{t('inv.itemDesc')}</th>
              <th className="p-2 text-end font-medium">{t('inv.qty')}</th>
              <th className="p-2 text-end font-medium">{t('inv.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0">
                <td className="p-2 text-slate-700">{it.description || '—'}</td>
                <td className="p-2 text-end text-slate-500">{it.qty}</td>
                <td className="p-2 text-end text-slate-700">{money(lineTotal(it))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t border-slate-100 p-2 text-sm">
          <Row label={t('inv.subtotal')} value={money(inv.subtotal)} />
          {inv.discount > 0 && <Row label={t('inv.discount')} value={`− ${money(inv.discount)}`} />}
          <Row label={t('inv.total')} value={money(inv.total)} strong />
        </div>
      </section>

      {inv.notes && <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{inv.notes}</p>}

      {/* Send */}
      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('inv.send')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={waLink('inv.waInvoiceMsg')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => !inv.sent_at && doMarkSent()}
            className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle size={16} /> {t('inv.sendWhatsapp')}
          </a>
          <button
            onClick={share}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700"
          >
            <FileDown size={16} /> {t('inv.sharePdf')}
          </button>
          <button
            onClick={() => copyLink()}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700"
          >
            <Link2 size={16} /> {copied ? t('inv.linkCopied') : t('inv.copyLink')}
          </button>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700"
          >
            <FileDown size={16} /> {t('inv.downloadPdf')}
          </a>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {!inv.sent_at && (
            <button
              onClick={doMarkSent}
              disabled={busy === 'sent'}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-60"
            >
              <Send size={16} /> {t('inv.markSent')}
            </button>
          )}
          {balance > 0 && (
            <a
              href={waLink(reminderTemplate)}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                overdue ? 'bg-red-50 text-red-600' : 'border border-slate-300 text-slate-600'
              }`}
            >
              <BellRing size={16} /> {t('inv.sendReminder')}
            </a>
          )}
        </div>
      </section>

      {/* Record payment */}
      {balance > 0 && (
        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('inv.recordPayment')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              {t('inv.paymentAmount')} ({inv.currency})
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-base focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-xs text-slate-500">
              {t('inv.paymentDate')}
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-base focus:border-brand focus:outline-none"
              />
            </label>
            <label className="text-xs text-slate-500">
              {t('inv.paymentMethod')}
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base focus:border-brand focus:outline-none"
              >
                <option value="cash">{t('pay.cash')}</option>
                <option value="card">{t('pay.card')}</option>
                <option value="transfer">{t('pay.transfer')}</option>
                <option value="other">{t('pay.other')}</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              {t('inv.paymentNote')}
              <input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-base focus:border-brand focus:outline-none"
              />
            </label>
          </div>
          <button
            onClick={pay}
            disabled={busy === 'pay'}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Check size={16} /> {busy === 'pay' ? t('inv.recording') : t('inv.recordBtn')}
          </button>
        </section>
      )}

      {/* Timeline */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('inv.timeline')}</h2>
        <ul className="space-y-2">
          {events.map((e, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Clock size={14} />
              </span>
              <span className="flex-1 text-slate-700">{e.label}</span>
              {e.extra && <span className="font-medium text-green-600">{e.extra}</span>}
              <span className="text-xs text-slate-400">{e.date}</span>
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </main>
  );
}

function Amount({ label, value, tone }: { label: string; value: string; tone?: 'in' | 'out' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p
        className={`text-sm font-bold ${
          tone === 'in' ? 'text-green-600' : tone === 'out' ? 'text-red-500' : 'text-slate-800'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
