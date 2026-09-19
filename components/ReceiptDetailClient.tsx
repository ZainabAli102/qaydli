'use client';

import Link from 'next/link';
import { useLocale } from '@/components/LocaleProvider';

export function ReceiptDetailClient(props: {
  imageUrl: string | null;
  transactionId: string | null;
  docId: string;
}) {
  const { t } = useLocale();
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4">
        <Link href="/receipts" className="text-sm text-brand">
          ‹ {t('receipts.title')}
        </Link>
      </div>

      {props.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.imageUrl}
          alt="receipt"
          className="mb-4 w-full rounded-lg border border-slate-200 object-contain"
        />
      ) : (
        <div className="mb-4 flex h-64 items-center justify-center rounded-lg bg-slate-100 text-slate-300">🧾</div>
      )}

      {props.transactionId ? (
        <Link
          href={`/transactions/${props.transactionId}`}
          className="block rounded-lg bg-brand px-4 py-3 text-center text-base font-semibold text-white"
        >
          {t('receipts.viewTransaction')}
        </Link>
      ) : (
        <Link
          href={`/review/${props.docId}`}
          className="block rounded-lg bg-brand px-4 py-3 text-center text-base font-semibold text-white"
        >
          {t('receipts.resume')}
        </Link>
      )}
    </main>
  );
}
