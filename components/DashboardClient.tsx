'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BottomNav } from '@/components/BottomNav';
import { signOut } from '@/app/(app)/scan/actions';
import { formatIqd, formatUsd, fromIqd } from '@/lib/money';
import { monthLabel } from '@/lib/month-label';
import type { TxnRow } from '@/lib/queries';

export function DashboardClient(props: {
  businessName: string;
  usdIqdRate: number;
  month: string;
  thisMonth: string;
  allTime: boolean;
  prevMonth: string;
  nextMonth: string;
  moneyIn: number;
  moneyOut: number;
  categories: Array<{ category: string; amount: number }>;
  transactions: TxnRow[];
  entries: number;
  trialLimit: number;
  savedMonth: string | null;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const rate = props.usdIqdRate;
  const profit = props.moneyIn - props.moneyOut;
  const maxCat = props.categories.reduce((m, c) => Math.max(m, c.amount), 0);
  const trialPct = Math.min(100, (props.entries / props.trialLimit) * 100);
  const thisMonth = props.thisMonth;

  // "Saved to <Month>" toast after a save; then clean the URL.
  const [toast, setToast] = useState<string | null>(
    props.savedMonth ? `${t('toast.savedTo')} ${monthLabel(props.savedMonth, locale)}` : null
  );
  useEffect(() => {
    if (!props.savedMonth) return;
    const timer = setTimeout(() => {
      setToast(null);
      router.replace(`/dashboard?m=${props.month}`);
    }, 3500);
    return () => clearTimeout(timer);
  }, [props.savedMonth, props.month, router]);

  return (
    <div className="flex min-h-dvh flex-col">
      {toast && (
        <div className="fixed inset-x-0 top-3 z-20 mx-auto flex max-w-md justify-center px-4">
          <div className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            ✓ {toast}
          </div>
        </div>
      )}
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-brand">{t('dash.title')}</h1>
            <p className="text-sm text-slate-500">{props.businessName}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <form action={signOut}>
              <button className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700">
                {t('signOut')}
              </button>
            </form>
          </div>
        </header>

        {/* First-run demo */}
        {props.entries === 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                {t('demo.badge')}
              </span>
              <span className="font-semibold text-amber-900">{t('demo.title')}</span>
            </div>
            <p className="mb-3 text-sm text-amber-800">{t('demo.body')}</p>
            <div className="flex gap-2">
              <Link href="/scan?demo=1" className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white">
                {t('demo.start')}
              </Link>
              <Link href="/scan" className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800">
                {t('demo.skip')}
              </Link>
            </div>
          </div>
        )}

        {/* Trial bar */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{t('trial.title')}</span>
            <span className="text-slate-500">
              {props.entries} {t('trial.of')} {props.trialLimit} {t('trial.used')}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${trialPct >= 100 ? 'bg-red-500' : 'bg-brand'}`}
              style={{ width: `${trialPct}%` }}
            />
          </div>
        </div>

        {/* Month switcher */}
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => router.push(`/dashboard?m=${props.prevMonth}`)}
            aria-label={t('dash.prevMonth')}
            disabled={props.allTime}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 disabled:opacity-30"
          >
            ‹
          </button>
          <span className="font-semibold text-slate-800">
            {props.allTime ? t('dash.allTime') : monthLabel(props.month, locale)}
          </span>
          <button
            onClick={() => router.push(`/dashboard?m=${props.nextMonth}`)}
            aria-label={t('dash.nextMonth')}
            disabled={props.allTime}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 disabled:opacity-30"
          >
            ›
          </button>
        </div>
        <div className="mb-4 text-center">
          {props.allTime ? (
            <button onClick={() => router.push(`/dashboard?m=${thisMonth}`)} className="text-xs font-medium text-brand">
              {monthLabel(thisMonth, locale)}
            </button>
          ) : (
            <button onClick={() => router.push('/dashboard?m=all')} className="text-xs font-medium text-brand">
              {t('dash.allTime')}
            </button>
          )}
        </div>

        {/* KPIs */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Kpi label={t('dash.moneyIn')} iqd={props.moneyIn} rate={rate} tone="in" />
          <Kpi label={t('dash.moneyOut')} iqd={props.moneyOut} rate={rate} tone="out" />
          <Kpi label={t('dash.profit')} iqd={profit} rate={rate} tone={profit >= 0 ? 'in' : 'out'} />
        </div>

        {/* Category bars */}
        {props.categories.length > 0 && (
          <section className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('dash.byCategory')}</h2>
            <div className="space-y-2">
              {props.categories.map((c) => (
                <div key={c.category}>
                  <div className="mb-0.5 flex justify-between text-xs text-slate-600">
                    <span>{t(`cat.${c.category}`)}</span>
                    <span>{formatIqd(c.amount)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-brand" style={{ width: `${maxCat ? (c.amount / maxCat) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent transactions */}
        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">{t('dash.recent')}</h2>
            <div className="flex items-center gap-3">
              <Link href={`/transactions?m=${props.allTime ? thisMonth : props.month}`} className="text-sm font-medium text-brand">
                {t('txn.viewAll')}
              </Link>
              <a href={`/api/export?m=${props.allTime ? thisMonth : props.month}`} className="text-sm font-medium text-brand">
                {t('dash.export')}
              </a>
            </div>
          </div>
          {props.transactions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
              {t('dash.noTransactions')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {props.transactions.slice(0, 8).map((tx) => (
                <li key={tx.id}>
                  <Link href={`/transactions/${tx.id}`} className="flex items-center justify-between px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{tx.vendor || t('review.vendor')}</p>
                      <p className="text-xs text-slate-500">
                        {t(`cat.${tx.category ?? 'other'}`)} · {tx.occurred_on ?? ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className={`font-semibold ${tx.direction === 'in' ? 'text-green-600' : 'text-slate-800'}`}>
                        {tx.direction === 'in' ? '+' : '−'}
                        {formatIqd(tx.amount)}
                      </p>
                      <p className="text-xs text-slate-400">{formatUsd(fromIqd(tx.amount, 'USD', rate))}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/scan"
            className="rounded-lg bg-brand px-4 py-3 text-center text-base font-semibold text-white"
          >
            📷 {t('dash.newScan')}
          </Link>
          <Link
            href="/manual"
            className="rounded-lg border border-brand px-4 py-3 text-center text-base font-semibold text-brand"
          >
            ✏️ {t('dash.addManually')}
          </Link>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

function Kpi({
  label,
  iqd,
  rate,
  tone,
}: {
  label: string;
  iqd: number;
  rate: number;
  tone: 'in' | 'out';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${tone === 'in' ? 'text-green-600' : 'text-slate-800'}`}>
        {formatIqd(iqd)}
      </p>
      <p className="text-xs text-slate-400">{formatUsd(fromIqd(iqd, 'USD', rate))}</p>
    </div>
  );
}
