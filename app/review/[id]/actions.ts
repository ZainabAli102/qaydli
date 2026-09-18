'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getEntryCount } from '@/lib/queries';
import { toIqd, type Currency } from '@/lib/money';
import {
  typeToDirection,
  FREE_TRIAL_LIMIT,
  type Category,
  type PaymentMethod,
  type TxnType,
} from '@/lib/domain';

export interface SaveTransactionInput {
  documentId: string;
  vendor: string;
  invoiceNumber: string;
  date: string; // ISO or ''
  currency: Currency;
  total: number;
  type: TxnType;
  category: Category;
  paymentMethod: PaymentMethod;
  lineItems: Array<{
    description: string;
    qty: number | null;
    unit_price: number | null;
    line_total: number | null;
  }>;
  notes: string;
}

export async function saveTransaction(
  input: SaveTransactionInput
): Promise<{ error: 'limit' | 'auth' | 'save' } | void> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'auth' };

  const supabase = await createClient();

  // Free-trial cap: block creating an 11th entry.
  if ((await getEntryCount(supabase)) >= FREE_TRIAL_LIMIT) return { error: 'limit' };

  const amountIqd = toIqd(input.total, input.currency, business.usd_iqd_rate);

  const { error: txnErr } = await supabase.from('transactions').insert({
    business_id: business.id,
    document_id: input.documentId,
    direction: typeToDirection(input.type),
    amount: amountIqd,
    original_amount: input.total,
    original_currency: input.currency,
    category: input.category,
    payment_method: input.paymentMethod,
    vendor: input.vendor || null,
    occurred_on: input.date || null,
    notes: input.notes || null,
  });
  if (txnErr) return { error: 'save' };

  // Keep the owner's corrections next to the raw extraction.
  await supabase
    .from('documents')
    .update({ corrections: input, status: 'reviewed' })
    .eq('id', input.documentId);

  redirect('/dashboard');
}
