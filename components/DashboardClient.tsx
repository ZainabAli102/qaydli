'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BottomNav } from '@/components/BottomNav';
import { signOut } from '@/app/(app)/scan/actions';
import { formatIqd, formatUsd, fromIqd } from '@/lib/money';
import type { TxnRow } from '@/lib/queries';

const LOCALE_TAG: Record<string, string> = { en: 'en', ar: 'ar-IQ', ckb: 'ckb-IQ' };

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? 'en', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return month;
  }
}

export function DashboardClient(props: {
  businessName: string;
  usdIqdRate: number;
  month: string;
  prevMonth: string;
  nextMonth: string;
  moneyIn: number;
  moneyOut: number;
  categories: Array<{ category: string; amount: number }>;
  transactions: TxnRow[];
  entries: number;
  trialLimit: number;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const rate = props.usdIqdRate;
  const profit = props.moneyIn - props.moneyOut;
  const maxCat = props.categories.reduce((m, c) => Math.max(m, c.amount), 0);
  const trialPct = Math.min(100, (props.entries / props.trialLimit) * 100);

  return (
    <div className="flex min-h-dvh flex-col">
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
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => router.push(`/dashboard?m=${props.prevMonth}`)}
            aria-label={t('dash.prevMonth')}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            ‹
          </button>
          <span className="font-semibold text-slate-800">{monthLabel(props.month, locale)}</span>
          <button
            onClick={() => router.push(`/dashboard?m=${props.nextMonth}`)}
            aria-label={t('dash.nextMonth')}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            ›
          </button>
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
            <a href={`/api/export?m=${props.month}`} className="text-sm font-medium text-brand">
              {t('dash.export')}
            </a>
          </div>
          {props.transactions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
              {t('dash.noTransactions')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {props.transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between px-3 py-2.5">
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
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link
          href="/scan"
          className="block rounded-lg bg-brand px-4 py-3 text-center text-base font-semibold text-white"
        >
          📷 {t('dash.newScan')}
        </Link>
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
