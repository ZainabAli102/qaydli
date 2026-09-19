'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, AlertTriangle, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { BottomNav } from '@/components/BottomNav';
import { CategoryIcon } from '@/components/icons';
import { TrendChart } from '@/components/TrendChart';
import { SummaryCard } from '@/components/SummaryCard';
import { monthLabel } from '@/lib/month-label';
import { formatIqd, formatUsd, fromIqd } from '@/lib/money';
import { setRecurring } from '@/app/(app)/insights/actions';
import type { Insights } from '@/lib/insights';

export function InsightsClient(props: {
  month: string;
  prevMonth: string;
  nextMonth: string;
  usdIqdRate: number;
  insights: Insights;
  receivables: { owed: number; overdue: number; avgDaysToPay: number | null } | null;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const rate = props.usdIqdRate;
  const ins = props.insights;
  const money = (iqd: number) => `${formatIqd(iqd)} · ${formatUsd(fromIqd(iqd, 'USD', rate))}`;
  const maxCat = ins.categories.reduce((m, c) => Math.max(m, c.amount), 0);

  const [pending, setPending] = useState<string | null>(null);
  async function toggle(key: string, next: boolean) {
    setPending(key);
    await setRecurring(key, next);
    router.refresh();
    setPending(null);
  }

  const empty = ins.txnCount === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-5">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand">{t('ins.title')}</h1>
        </header>

        {/* Month switcher */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push(`/insights?m=${props.prevMonth}`)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            <ChevronLeft size={20} className="rtl:-scale-x-100" />
          </button>
          <span className="font-semibold text-slate-800">{monthLabel(props.month, locale)}</span>
          <button
            onClick={() => router.push(`/insights?m=${props.nextMonth}`)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            <ChevronRight size={20} className="rtl:-scale-x-100" />
          </button>
        </div>

        {/* 1. This vs last month */}
        <section className="grid grid-cols-3 gap-2">
          <Kpi label={t('dash.moneyIn')} iqd={ins.thisMonth.in} rate={rate} delta={ins.delta.in} good="up" />
          <Kpi label={t('dash.moneyOut')} iqd={ins.thisMonth.out} rate={rate} delta={ins.delta.out} good="down" />
          <Kpi
            label={t('dash.profit')}
            iqd={ins.thisMonth.profit}
            rate={rate}
            delta={ins.delta.profit}
            good="up"
          />
        </section>

        {/* Receivables (invoices) */}
        {props.receivables && (
          <section className="grid grid-cols-3 gap-2">
            <Stat label={t('inv.owedToYou')} value={formatIqd(props.receivables.owed)} />
            <Stat
              label={t('inv.overdueAmount')}
              value={formatIqd(props.receivables.overdue)}
              tone={props.receivables.overdue > 0 ? 'bad' : undefined}
            />
            <Stat
              label={t('inv.avgDaysToPay')}
              value={
                props.receivables.avgDaysToPay == null
                  ? '—'
                  : `${props.receivables.avgDaysToPay} ${t('inv.days')}`
              }
            />
          </section>
        )}

        {/* 2. 6-month trend */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">{t('ins.trend')}</h2>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-green-600" /> {t('dash.moneyIn')}</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-red-500" /> {t('dash.moneyOut')}</span>
            </div>
          </div>
          <TrendChart data={ins.trend} onMonthClick={(m) => router.push(`/dashboard?m=${m}`)} />
        </section>

        {/* 3. Where the money goes */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('ins.whereMoneyGoes')}</h2>
          {ins.categories.length === 0 ? (
            <Empty text={t('ins.empty')} />
          ) : (
            <div className="space-y-2">
              {ins.categories.map((c) => (
                <div key={c.category} className="flex items-center gap-2">
                  <CategoryIcon category={c.category} size={18} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="truncate text-slate-600">{t(`cat.${c.category}`)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-slate-700">{formatIqd(c.amount)}</span>
                        <DeltaChip delta={c.deltaPct} good="down" />
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-brand" style={{ width: `${maxCat ? (c.amount / maxCat) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. Top vendors */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('ins.topVendors')}</h2>
          {ins.topVendors.length === 0 ? (
            <Empty text={t('ins.empty')} />
          ) : (
            <ul className="space-y-1.5">
              {ins.topVendors.map((v) => (
                <li key={v.vendor} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate text-slate-700">{v.vendor}</span>
                  <span className="shrink-0 text-slate-500">
                    <span className="me-2 text-xs text-slate-400">{v.count} {t('ins.txnsShort')}</span>
                    {formatIqd(v.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 5. Fixed vs variable */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">{t('ins.fixedTitle')}</h2>
            <span className="text-sm font-semibold text-brand">{money(ins.recurring.fixedTotal)}</span>
          </div>
          {ins.recurring.groups.length === 0 ? (
            <Empty text={t('ins.noFixed')} />
          ) : (
            <ul className="space-y-1.5">
              {ins.recurring.groups.map((g) => (
                <li key={g.key} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    {g.kind === 'category' && <CategoryIcon category={g.label} size={18} />}
                    <div className="min-w-0">
                      <p className="truncate text-slate-700">
                        {g.kind === 'category' ? t(`cat.${g.label}`) : g.label}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatIqd(g.monthlyAmount)} · {g.monthsPresent}m
                      </p>
                    </div>
                  </div>
                  <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                    {t('ins.recurring')}
                    <input
                      type="checkbox"
                      checked={g.recurring}
                      disabled={pending === g.key}
                      onChange={(e) => toggle(g.key, e.target.checked)}
                      className="h-4 w-4 accent-[#0f766e]"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 6. Unusual items */}
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('ins.unusual')}</h2>
          {ins.unusual.length === 0 ? (
            <Empty text={t('ins.noUnusual')} />
          ) : (
            <ul className="space-y-1.5">
              {ins.unusual.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle size={18} className="shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="truncate text-slate-700">{u.vendor || '—'}</p>
                      <p className="text-xs text-amber-600">{t(`ins.reason.${u.reason}`)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-medium text-slate-700">{formatIqd(u.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 7. Summary (model, numbers only) */}
        <SummaryCard
          month={props.month}
          signatureKey={`${ins.txnCount}:${ins.thisMonth.in}:${ins.thisMonth.out}`}
        />

        {empty && <p className="pb-2 text-center text-xs text-slate-400">{t('ins.empty')}</p>}
      </main>
      <BottomNav />
    </div>
  );
}

function Kpi({
  label,
  iqd,
  rate,
  delta,
  good,
}: {
  label: string;
  iqd: number;
  rate: number;
  delta: number | null;
  good: 'up' | 'down';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-800">{formatIqd(iqd)}</p>
      <p className="text-xs text-slate-400">{formatUsd(fromIqd(iqd, 'USD', rate))}</p>
      <div className="mt-1">
        <DeltaChip delta={delta} good={good} />
      </div>
    </div>
  );
}

function DeltaChip({ delta, good }: { delta: number | null; good: 'up' | 'down' }) {
  if (delta === null) return <span className="text-xs text-slate-300">—</span>;
  const rounded = Math.round(delta);
  const up = rounded > 0;
  const flat = rounded === 0;
  const isGood = flat ? true : (good === 'up' ? up : !up);
  const color = flat ? 'text-slate-400' : isGood ? 'text-green-600' : 'text-red-500';
  const Arrow = flat ? Minus : up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Arrow size={12} /> {Math.abs(rounded)}%
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${tone === 'bad' ? 'text-red-500' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-3 text-center text-xs text-slate-400">{text}</p>;
}
