import { redirect, notFound } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getTransaction } from '@/lib/queries';
import { directionToType, type Category, type PaymentMethod } from '@/lib/domain';
import { ReviewForm, type ReviewInitial, type ReviewLineItem } from '@/components/ReviewForm';

export const dynamic = 'force-dynamic';

// Transaction detail: the Review form pre-filled and editable, the receipt photo
// if there is one, and Delete (with confirm) inside the form.
export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  const tx = await getTransaction(supabase, id);
  if (!tx) notFound();

  // Line items / invoice no. live in the document's saved corrections (if any).
  let imageUrl: string | null = null;
  let lineItems: ReviewLineItem[] = [];
  let invoiceNumber = '';
  if (tx.document_id) {
    const { data: doc } = await supabase
      .from('documents')
      .select('storage_path, corrections')
      .eq('id', tx.document_id)
      .maybeSingle();
    if (doc?.storage_path) {
      const { data: signed } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.storage_path as string, 600);
      imageUrl = signed?.signedUrl ?? null;
    }
    const c = (doc?.corrections ?? null) as
      | { lineItems?: ReviewLineItem[]; invoiceNumber?: string }
      | null;
    if (c?.lineItems) lineItems = c.lineItems;
    if (c?.invoiceNumber) invoiceNumber = c.invoiceNumber;
  }

  const currency = tx.original_currency === 'USD' ? 'USD' : 'IQD';
  const total =
    tx.original_amount != null ? tx.original_amount : currency === 'USD' ? null : tx.amount;

  const initial: ReviewInitial = {
    documentId: tx.document_id,
    imageUrl,
    usdIqdRate: business.usd_iqd_rate,
    vendor: tx.vendor ?? '',
    vendorLatin: '',
    invoiceNumber,
    date: tx.occurred_on ?? '',
    currency,
    total,
    paid: null,
    remaining: null,
    lineItems,
    notes: tx.notes ?? '',
    flags: [],
    category: (tx.category as Category) ?? 'other',
    categorySuggested: false,
    paymentMethod: (tx.payment_method as PaymentMethod) ?? 'cash',
    type: directionToType(tx.direction),
    fromMemory: false,
    conf: { vendor: 0, date: 0, total: 0, currency: 0 },
    mode: 'edit',
    transactionId: tx.id,
  };

  return <ReviewForm initial={initial} />;
}
