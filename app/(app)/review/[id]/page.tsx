import { redirect, notFound } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getVendorMemory } from '@/lib/queries';
import { resolveCategory, type PaymentMethod } from '@/lib/domain';
import { ReviewForm, type ReviewInitial } from '@/components/ReviewForm';
import type { ReceiptResult } from '@/lib/engine/types';

export const dynamic = 'force-dynamic';

function val<T>(f: { value: T | null; confidence: number } | undefined, fallback: T): T {
  const v = f?.value;
  return v == null ? fallback : v;
}
function conf(f: { confidence: number } | undefined): number {
  return f?.confidence ?? 0;
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path, extraction')
    .eq('id', id)
    .maybeSingle();
  if (!doc) notFound();

  const r = (doc.extraction ?? {}) as Partial<ReceiptResult>;

  const { data: signed } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_path as string, 3600);

  const vendor = val(r.vendor, '') || val(r.vendor_latin, '');
  const memory = await getVendorMemory(supabase, vendor || null);

  // Category: vendor memory → model suggestion → keyword guess → 'other'.
  // Every source is validated, so a retired/misspelled slug never blanks it.
  const cat = resolveCategory({
    memory: memory?.category,
    model: r.category?.value,
    text: `${vendor} ${val(r.notes, '')}`,
  });

  const pmRaw = memory?.payment_method ?? (val(r.payment_method, '') as PaymentMethod);
  const paymentMethod: PaymentMethod = pmRaw || 'cash';

  const rawCurrency = val(r.currency, 'IQD');
  const currency = rawCurrency === 'USD' ? 'USD' : 'IQD';

  const initial: ReviewInitial = {
    documentId: doc.id as string,
    imageUrl: signed?.signedUrl ?? null,
    usdIqdRate: business.usd_iqd_rate,
    vendor,
    vendorLatin: val(r.vendor_latin, ''),
    invoiceNumber: val(r.invoice_number, ''),
    date: val(r.date, ''),
    currency,
    total: r.total?.value ?? null,
    paid: r.paid_amount?.value ?? null,
    remaining: r.remaining?.value ?? null,
    lineItems: (r.line_items ?? []).map((li) => ({
      description: li.description ?? '',
      qty: li.qty,
      unit_price: li.unit_price,
      line_total: li.line_total,
    })),
    notes: val(r.notes, ''),
    flags: r.flags ?? [],
    category: cat.category,
    categorySuggested: cat.suggested,
    paymentMethod,
    type: 'expense',
    mode: 'scan',
    fromMemory: cat.fromMemory,
    conf: {
      vendor: conf(r.vendor),
      date: conf(r.date),
      total: conf(r.total),
      currency: conf(r.currency),
    },
  };

  return <ReviewForm initial={initial} />;
}
