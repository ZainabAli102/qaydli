'use client';

import { useLocale } from '@/components/LocaleProvider';
import type { DisplayStatus } from '@/lib/invoices';

const STYLES: Record<DisplayStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-sky-100 text-sky-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

export function InvoiceStatusBadge({ status }: { status: DisplayStatus }) {
  const { t } = useLocale();
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}>
      {t(`inv.status.${status}`)}
    </span>
  );
}
