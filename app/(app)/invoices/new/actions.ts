'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getEntryCount } from '@/lib/queries';
import { FREE_TRIAL_LIMIT } from '@/lib/domain';
import { computeTotals, type InvoiceCurrency, type InvoiceItem } from '@/lib/invoices';
import { validateTotal } from '@/lib/validation';
import {
  recordCorrections,
  learnItemPhrases,
  learnClientAlias,
  type CorrectionSource,
} from '@/lib/corrections';

export interface CreateInvoiceInput {
  clientId: string | null;
  newClient: { name: string; phone: string; email: string; address: string } | null;
  items: InvoiceItem[];
  currency: InvoiceCurrency;
  discount: number;
  issueDate: string; // 'YYYY-MM-DD'
  dueDate: string | null;
  notes: string;
  documentId: string | null; // scan origin, if any
  // Owner explicitly allowed a 0 total (credit note / fully discounted invoice).
  intentionalZero?: boolean;
  // Learning loop: what Describe/voice proposed, for corrections + client alias.
  learn?: {
    source: CorrectionSource;
    language: string;
    modelUsed: string | null;
    spokenClientName: string | null; // client name as the AI heard it
    resolvedClientName: string | null; // the client the owner actually chose
    aiCurrency: string | null;
  };
}

export type CreateInvoiceResult =
  | { error: 'limit' }
  | { error: 'auth'; message: string }
  | { error: 'validation'; message: string }
  | { error: 'save'; message: string }
  | void;

export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business)
    return { error: 'auth', message: 'Your session has expired. Please sign in again.' };

  const supabase = await createClient();

  // Invoices count toward the free trial, like transactions.
  if ((await getEntryCount(supabase)) >= FREE_TRIAL_LIMIT) return { error: 'limit' };

  const items = (input.items ?? []).filter(
    (it) => (it.description ?? '').trim() !== '' || Number(it.qty) || Number(it.unit_price)
  );
  if (items.length === 0)
    return { error: 'validation', message: 'Add at least one item.' };

  // Resolve the client: an existing id, or create a new one from the typed name.
  let clientId = input.clientId;
  if (!clientId && input.newClient && input.newClient.name.trim()) {
    const { data: created, error: cErr } = await supabase
      .from('clients')
      .insert({
        business_id: business.id,
        name: input.newClient.name.trim(),
        phone: input.newClient.phone.trim() || null,
        email: input.newClient.email.trim() || null,
        address: input.newClient.address.trim() || null,
      })
      .select('id')
      .single();
    if (cErr) return { error: 'save', message: cErr.message };
    clientId = created.id;
  }
  if (!clientId) return { error: 'validation', message: 'Choose or add a client.' };

  const { subtotal, discount, total } = computeTotals(items, input.discount);

  // Block a zero/empty/negative total unless the owner marked it intentional.
  if (!validateTotal(total, { allowZero: input.intentionalZero === true }).ok) {
    return {
      error: 'validation',
      message: 'Total is 0. Check the amounts, or mark the invoice as intentionally 0.',
    };
  }

  // Claim the next per-business number atomically.
  const { data: numData, error: numErr } = await supabase.rpc('next_invoice_number');
  const numRow = Array.isArray(numData) ? numData[0] : numData;
  if (numErr || !numRow) return { error: 'save', message: numErr?.message || 'Could not assign a number.' };

  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)
    ? input.issueDate
    : new Date().toISOString().slice(0, 10);
  const dueDate = input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) ? input.dueDate : null;

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .insert({
      business_id: business.id,
      client_id: clientId,
      document_id: input.documentId,
      seq: numRow.seq,
      number: numRow.number,
      items,
      currency: input.currency,
      usd_iqd_rate: business.usd_iqd_rate,
      subtotal,
      discount,
      total,
      issue_date: issueDate,
      due_date: dueDate,
      status: 'draft',
      notes: input.notes.trim() || null,
      public_token: randomUUID(),
    })
    .select('id')
    .single();
  if (invErr) return { error: 'save', message: invErr.message };

  // Learning loop (best-effort): item phrases always; client alias + corrections
  // when Describe/voice was used.
  try {
    await learnItemPhrases(
      supabase,
      items.map((it) => ({ description: it.description, unit_price: it.unit_price }))
    );
    const learn = input.learn;
    if (learn) {
      await learnClientAlias(supabase, learn.spokenClientName, clientId, learn.resolvedClientName);
      await recordCorrections(
        supabase,
        business.id,
        { source: learn.source, language: learn.language, modelUsed: learn.modelUsed, ai: {
          client: learn.spokenClientName,
          currency: learn.aiCurrency,
        } },
        {
          client: (learn.resolvedClientName ?? '').trim(),
          currency: input.currency,
        }
      );
    }
  } catch (err) {
    console.error('[createInvoice] learning failed:', err);
  }

  redirect(`/invoices/${inv.id}`);
}
