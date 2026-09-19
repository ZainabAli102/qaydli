'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import { BottomNav } from '@/components/BottomNav';
import { monthLabel } from '@/lib/month-label';

export interface ReceiptCard {
  docId: string;
  path: string;
  url: string | null;
  vendor: string;
  date: string;
  amount: string;
  transactionId: string | null;
}

export function ReceiptsClient(props: {
  month: string;
  prevMonth: string;
  nextMonth: string;
  filed: ReceiptCard[];
  unfiled: ReceiptCard[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-5">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand">{t('receipts.title')}</h1>
          <a
            href={`/api/receipts/download?m=${props.month}`}
            className="rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand"
          >
            ⬇ {t('receipts.downloadAll')}
          </a>
        </header>

        {/* Month switcher */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => router.push(`/receipts?m=${props.prevMonth}`)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            ‹
          </button>
          <span className="font-semibold text-slate-800">{monthLabel(props.month, locale)}</span>
          <button
            onClick={() => router.push(`/receipts?m=${props.nextMonth}`)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600"
          >
            ›
          </button>
        </div>

        {props.filed.length === 0 ? (
          <p className="mb-6 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
            {t('receipts.empty')}
          </p>
        ) : (
          <Grid cards={props.filed} />
        )}

        {props.unfiled.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-amber-700">
              {t('receipts.unfiled')} ({props.unfiled.length})
            </h2>
            <Grid cards={props.unfiled} resume />
          </section>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function Grid({ cards, resume }: { cards: ReceiptCard[]; resume?: boolean }) {
  const { t } = useLocale();
  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <div key={c.docId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Link href={`/receipts/${c.docId}`} className="block">
            {c.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.url} alt={c.vendor || 'receipt'} className="h-32 w-full bg-slate-50 object-cover" />
            ) : (
              <div className="flex h-32 w-full items-center justify-center bg-slate-100 text-slate-300">🧾</div>
            )}
          </Link>
          <div className="p-2">
            <p className="truncate text-sm font-medium text-slate-800">{c.vendor || '—'}</p>
            <p className="text-xs text-slate-500">{c.date || '—'}</p>
            <p className="text-xs font-medium text-slate-700">{c.amount}</p>
            {resume && (
              <Link
                href={`/review/${c.docId}`}
                className="mt-1 inline-block rounded bg-brand px-2 py-1 text-xs font-semibold text-white"
              >
                {t('receipts.resume')}
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
