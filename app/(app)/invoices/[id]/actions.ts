'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';

export type ActionResult = { ok: true } | { error: string };

/** Record a payment: RPC inserts the payment, the money-in ledger entry, and
 *  re-derives the invoice status, all atomically. */
export async function recordPayment(input: {
  invoiceId: string;
  amount: number;
  date: string;
  method: string;
  note: string;
}): Promise<ActionResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'Your session has expired. Please sign in again.' };
  if (!(input.amount > 0)) return { error: 'Enter a payment amount.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_invoice_payment', {
    p_invoice: input.invoiceId,
    p_amount: input.amount,
    p_date: /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : new Date().toISOString().slice(0, 10),
    p_method: input.method || null,
    p_note: input.note || null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/invoices/${input.invoiceId}`);
  return { ok: true };
}

/** Mark an invoice as sent (records sent_at; promotes draft → sent). */
export async function markSent(invoiceId: string): Promise<ActionResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'Your session has expired. Please sign in again.' };

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .maybeSingle();
  const status = inv?.status === 'draft' ? 'sent' : inv?.status;
  const { error } = await supabase
    .from('invoices')
    .update({ sent_at: new Date().toISOString(), status, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) return { error: error.message };
  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true };
}

export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'Your session has expired. Please sign in again.' };
  const supabase = await createClient();
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId);
  if (error) return { error: error.message };
  redirect('/invoices');
}
