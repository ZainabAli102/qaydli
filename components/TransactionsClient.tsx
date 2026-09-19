'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { BottomNav } from '@/components/BottomNav';
import { CategoryIcon } from '@/components/icons';
import { CATEGORIES, type Category, type TxnType } from '@/lib/domain';
import { formatIqd, formatUsd, fromIqd } from '@/lib/money';
import { monthLabel } from '@/lib/month-label';
import type { TxnRow } from '@/lib/queries';

export function TransactionsClient(props: {
  month: string;
  prevMonth: string;
  nextMonth: string;
  usdIqdRate: number;
  transactions: TxnRow[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | Category>('all');
  const [type, setType] = useState<'all' | TxnType>('all');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return props.transactions.filter((tx) => {
      if (needle && !(tx.vendor ?? '').toLowerCase().includes(needle)) return false;
      if (cat !== 'all' && (tx.category ?? 'other') !== cat) return false;
      if (type !== 'all') {
        const ty = tx.direction === 'in' ? 'income' : 'expense';
        if (ty !== type) return false;
      }
      return true;
    });
  }, [props.transactions, q, cat, type]);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand">{t('txn.title')}</h1>
          <Link href="/dashboard" className="text-sm text-brand">
            {t('nav.dashboard')}
          </Link>
        </header>

        {/* Month switcher */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => router.push(`/transactions?m=${props.prevMonth}`)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            <ChevronLeft size={20} className="rtl:-scale-x-100" />
          </button>
          <span className="font-semibold text-slate-800">{monthLabel(props.month, locale)}</span>
          <button
            onClick={() => router.push(`/transactions?m=${props.nextMonth}`)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            <ChevronRight size={20} className="rtl:-scale-x-100" />
          </button>
        </div>

        {/* Search + filters */}
        <div className="mb-3 space-y-2">
          <div className="relative">
            <Search size={18} className="absolute top-1/2 start-3 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('txn.search')}
              className="w-full rounded-md border border-slate-300 py-2 pe-3 ps-9 text-base focus:border-brand focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value as 'all' | Category)}
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              <option value="all">{t('txn.filterCategory')}: {t('txn.all')}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`cat.${c}`)}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'all' | TxnType)}
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              <option value="all">{t('txn.filterType')}: {t('txn.all')}</option>
              <option value="expense">{t('type.expense')}</option>
              <option value="income">{t('type.income')}</option>
            </select>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
            {t('txn.none')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {rows.map((tx) => (
              <li key={tx.id}>
                <Link href={`/transactions/${tx.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <CategoryIcon category={tx.category} size={20} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{tx.vendor || t('review.vendor')}</p>
                      <p className="text-xs text-slate-500">
                        {t(`cat.${tx.category ?? 'other'}`)} · {tx.occurred_on ?? ''}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className={`font-semibold ${tx.direction === 'in' ? 'text-green-600' : 'text-slate-800'}`}>
                      {tx.direction === 'in' ? '+' : '−'}
                      {formatIqd(tx.amount)}
                    </p>
                    <p className="text-xs text-slate-400">{formatUsd(fromIqd(tx.amount, 'USD', props.usdIqdRate))}</p>
                  </div>
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
