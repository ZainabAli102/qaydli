'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronLeft } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { BottomNav } from '@/components/BottomNav';
import { InvoiceStatusBadge } from '@/components/InvoiceStatusBadge';
import { displayStatus, matchesTab, type InvoiceTab } from '@/lib/invoices';
import { formatMoney, formatIqd, toIqd } from '@/lib/money';
import type { InvoiceListRow } from '@/lib/invoice-queries';

const TABS: InvoiceTab[] = ['all', 'due', 'overdue', 'paid'];

export function InvoicesClient(props: { invoices: InvoiceListRow[]; today: string }) {
  const { t } = useLocale();
  const [tab, setTab] = useState<InvoiceTab>('all');

  const withDisplay = useMemo(
    () =>
      props.invoices.map((inv) => ({
        inv,
        display: displayStatus({ status: inv.status, dueDate: inv.due_date, today: props.today }),
      })),
    [props.invoices, props.today]
  );

  const rows = withDisplay.filter((r) => matchesTab(tab, r.display));

  // Per-tab total, in IQD so mixed-currency invoices add up. "Due"/"Overdue"
  // show what is still owed; the others show the invoiced total.
  const tabTotal = rows.reduce((sum, { inv }) => {
    const outstanding = tab === 'due' || tab === 'overdue' ? Math.max(0, inv.total - inv.paid) : inv.total;
    return sum + toIqd(outstanding, inv.currency, inv.usd_iqd_rate);
  }, 0);

  const counts = useMemo(() => {
    const c: Record<InvoiceTab, number> = { all: 0, due: 0, overdue: 0, paid: 0 };
    for (const r of withDisplay) for (const tb of TABS) if (matchesTab(tb, r.display)) c[tb] += 1;
    return c;
  }, [withDisplay]);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand">{t('inv.title')}</h1>
          <Link
            href="/invoices/new"
            className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Plus size={16} /> {t('inv.new')}
          </Link>
        </header>

        {/* Tabs */}
        <div className="mb-3 flex gap-1 overflow-x-auto">
          {TABS.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                tab === tb ? 'bg-brand text-white' : 'border border-slate-300 text-slate-600'
              }`}
            >
              {t(`inv.tab.${tb}`)} {counts[tb] > 0 && <span className="opacity-70">({counts[tb]})</span>}
            </button>
          ))}
        </div>

        {/* Per-tab total */}
        <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <span className="text-slate-500">{t('inv.totalForTab')}</span>
          <span className="font-bold text-slate-800">{formatIqd(tabTotal)}</span>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            {t('inv.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ inv, display }) => (
              <li key={inv.id}>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{inv.number}</span>
                      <InvoiceStatusBadge status={display} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-600">{inv.client_name || '—'}</p>
                    {inv.due_date && (
                      <p className={`text-xs ${display === 'overdue' ? 'text-red-500' : 'text-slate-400'}`}>
                        {t('inv.due')}: {inv.due_date}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-semibold text-slate-800">{formatMoney(inv.total, inv.currency)}</p>
                    {inv.paid > 0 && inv.paid < inv.total && (
                      <p className="text-xs text-amber-600">
                        {t('inv.balance')}: {formatMoney(inv.total - inv.paid, inv.currency)}
                      </p>
                    )}
                  </div>
                  <ChevronLeft size={18} className="shrink-0 rotate-180 text-slate-300 rtl:rotate-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
