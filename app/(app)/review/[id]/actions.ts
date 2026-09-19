'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getEntryCount } from '@/lib/queries';
import { toIqd, type Currency } from '@/lib/money';
import { todayISO, monthOf } from '@/lib/dates';
import {
  typeToDirection,
  FREE_TRIAL_LIMIT,
  type Category,
  type PaymentMethod,
  type TxnType,
} from '@/lib/domain';
import { learnFromTxn } from '@/lib/txn-learning';
import type { LearnMeta } from '@/lib/corrections';

export interface SaveTransactionInput {
  documentId: string | null; // null for manual entries (no scanned document)
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

export type SaveResult =
  | { error: 'limit' }
  | { error: 'auth'; message: string }
  | { error: 'save'; message: string }
  | void;

export async function saveTransaction(
  input: SaveTransactionInput,
  learn?: LearnMeta
): Promise<SaveResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'auth', message: 'Your session has expired. Please sign in again.' };

  const supabase = await createClient();

  // Free-trial cap: block creating an 11th entry (manual or scanned).
  if ((await getEntryCount(supabase)) >= FREE_TRIAL_LIMIT) return { error: 'limit' };

  const amountIqd = toIqd(input.total, input.currency, business.usd_iqd_rate);

  // Never leave occurred_on null — a null date drops out of every month view
  // (it only shows under "All time"). Default a blank date to today (Baghdad).
  const occurredOn = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayISO();

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
    occurred_on: occurredOn,
    notes: input.notes || null,
  });
  if (txnErr) {
    // Surface the real Supabase error to the caller — never fail silently.
    console.error('[saveTransaction] insert failed:', txnErr);
    return { error: 'save', message: txnErr.message || 'Could not save the transaction.' };
  }

  // Keep the owner's corrections next to the raw extraction (scanned entries only).
  if (input.documentId) {
    const { error: docErr } = await supabase
      .from('documents')
      .update({ corrections: input, status: 'reviewed' })
      .eq('id', input.documentId);
    if (docErr) console.error('[saveTransaction] documents update failed:', docErr);
  }

  // Learning loop: capture corrections + reinforce memory (best-effort).
  await learnFromTxn(supabase, business.id, input, learn);

  // Open the dashboard on the transaction's own month and flag the toast —
  // derived from the SAME date we stored, via the shared helper.
  const ym = monthOf(occurredOn);
  redirect(`/dashboard?m=${ym}&saved=${ym}`);
}
