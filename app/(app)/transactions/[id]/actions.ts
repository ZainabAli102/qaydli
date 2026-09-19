'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { toIqd } from '@/lib/money';
import { typeToDirection } from '@/lib/domain';
import { todayISO, monthOf } from '@/lib/dates';
import { learnFromTxn } from '@/lib/txn-learning';
import { validateTotal } from '@/lib/validation';
import type { LearnMeta } from '@/lib/corrections';
import type { SaveTransactionInput, SaveResult } from '@/app/(app)/review/[id]/actions';

// Update an existing transaction (no trial check — not a new entry).
export async function updateTransaction(
  id: string,
  input: SaveTransactionInput,
  learn?: LearnMeta
): Promise<SaveResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'auth', message: 'Your session has expired. Please sign in again.' };

  // Guard against a zero/empty/negative total (transactions never allow zero).
  if (!validateTotal(input.total).ok) {
    return { error: 'save', message: 'Total must be greater than zero. Check the receipt and enter the amount.' };
  }

  const supabase = await createClient();
  const amountIqd = toIqd(input.total, input.currency, business.usd_iqd_rate);
  const occurredOn = /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayISO();

  const { error: txnErr } = await supabase
    .from('transactions')
    .update({
      direction: typeToDirection(input.type),
      amount: amountIqd,
      original_amount: input.total,
      original_currency: input.currency,
      category: input.category,
      payment_method: input.paymentMethod,
      vendor: input.vendor || null,
      occurred_on: occurredOn,
      notes: input.notes || null,
    })
    .eq('id', id);
  if (txnErr) {
    console.error('[updateTransaction] update failed:', txnErr);
    return { error: 'save', message: txnErr.message || 'Could not update the transaction.' };
  }

  // Keep the owner's corrections next to the raw extraction (scanned entries).
  if (input.documentId) {
    await supabase
      .from('documents')
      .update({ corrections: input, status: 'reviewed' })
      .eq('id', input.documentId);
  }

  // Learning loop: capture edits as corrections + reinforce memory.
  await learnFromTxn(supabase, business.id, input, learn);

  const ym = monthOf(occurredOn);
  redirect(`/dashboard?m=${ym}&saved=${ym}`);
}

// Delete a transaction. Its document (photo) stays and moves to "Unfiled".
// Deleting frees a trial entry (the trial counts transactions).
export async function deleteTransaction(id: string): Promise<SaveResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'auth', message: 'Your session has expired. Please sign in again.' };

  const supabase = await createClient();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) {
    console.error('[deleteTransaction] delete failed:', error);
    return { error: 'save', message: error.message || 'Could not delete the transaction.' };
  }
  redirect('/dashboard');
}
