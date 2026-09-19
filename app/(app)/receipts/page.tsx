import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { currentMonth, isMonth, monthRange, monthOf } from '@/lib/dates';
import { formatIqd, formatUsd } from '@/lib/money';
import { ReceiptsClient, type ReceiptCard } from '@/components/ReceiptsClient';

export const dynamic = 'force-dynamic';

const SIGNED_TTL = 300; // 5 minutes

function num(v: unknown): number | null {
  const f = v as { value?: unknown } | undefined;
  const n = f && typeof f === 'object' ? Number(f.value) : Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string {
  const f = v as { value?: unknown } | undefined;
  const s = f && typeof f === 'object' ? f.value : v;
  return s == null ? '' : String(s);
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const { m } = await searchParams;
  const month = isMonth(m) ? m : currentMonth();
  const { prev, next } = monthRange(month);

  const supabase = await createClient();
  const [{ data: docs }, { data: txns }] = await Promise.all([
    supabase
      .from('documents')
      .select('id, storage_path, extraction, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('transactions')
      .select('id, document_id, vendor, occurred_on, amount, original_amount, original_currency')
      .not('document_id', 'is', null),
  ]);

  type Txn = {
    id: string;
    document_id: string;
    vendor: string | null;
    occurred_on: string | null;
    amount: number;
  };
  const byDoc = new Map<string, Txn>();
  for (const t of (txns ?? []) as Txn[]) byDoc.set(t.document_id, t);

  const rate = business.usd_iqd_rate;
  const filed: ReceiptCard[] = [];
  const unfiled: ReceiptCard[] = [];

  for (const d of (docs ?? []) as Array<{
    id: string;
    storage_path: string;
    extraction: unknown;
    created_at: string;
  }>) {
    const tx = byDoc.get(d.id);
    if (tx) {
      if (monthOf(tx.occurred_on ?? undefined) !== month) continue; // only this month
      filed.push({
        docId: d.id,
        path: d.storage_path,
        url: null,
        vendor: tx.vendor || '',
        date: tx.occurred_on ?? '',
        amount: `${formatIqd(tx.amount)} · ${formatUsd(rate ? tx.amount / rate : 0)}`,
        transactionId: tx.id,
      });
    } else {
      const ex = (d.extraction ?? {}) as Record<string, unknown>;
      const total = num(ex.total);
      const cur = str(ex.currency) === 'USD' ? 'USD' : 'IQD';
      unfiled.push({
        docId: d.id,
        path: d.storage_path,
        url: null,
        vendor: str(ex.vendor) || str(ex.vendor_latin),
        date: str(ex.date),
        amount: total == null ? '—' : cur === 'USD' ? formatUsd(total) : formatIqd(total),
        transactionId: null,
      });
    }
  }

  // Short-lived signed URLs for the thumbnails actually shown.
  const shown = [...filed, ...unfiled];
  if (shown.length) {
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrls(
        shown.map((c) => c.path),
        SIGNED_TTL
      );
    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    for (const c of shown) c.url = urlByPath.get(c.path) ?? null;
  }

  return (
    <ReceiptsClient
      month={month}
      prevMonth={prev}
      nextMonth={next}
      filed={filed}
      unfiled={unfiled}
    />
  );
}
