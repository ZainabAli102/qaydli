// Server-side invoice data helpers. Each takes an authenticated Supabase client
// so RLS scopes everything to the caller's business. Payment sums are folded in
// here (the JS client can't GROUP BY), which is fine at a phone app's volume.

import type { SupabaseClient } from '@supabase/supabase-js';
import { toIqd } from '@/lib/money';
import type { InvoiceCurrency, InvoiceItem, InvoiceStatus } from '@/lib/invoices';

export interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface InvoicePaymentRow {
  id: string;
  invoice_id: string;
  amount: number;
  currency: InvoiceCurrency;
  paid_on: string;
  method: string | null;
  note: string | null;
  created_at: string;
}

export interface InvoiceListRow {
  id: string;
  number: string;
  currency: InvoiceCurrency;
  total: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  sent_at: string | null;
  usd_iqd_rate: number;
  client_id: string | null;
  client_name: string | null;
  paid: number;
}

export interface InvoiceDetail extends InvoiceListRow {
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  notes: string | null;
  public_token: string | null;
  pdf_path: string | null;
  document_id: string | null;
  created_at: string;
  client: ClientRow | null;
  payments: InvoicePaymentRow[];
}

/** All clients for the business, name-sorted. */
export async function getClients(supabase: SupabaseClient): Promise<ClientRow[]> {
  const { data } = await supabase
    .from('clients')
    .select('id, name, phone, email, notes')
    .order('name', { ascending: true });
  return (data as ClientRow[]) ?? [];
}

type RawInvoice = {
  id: string;
  number: string;
  currency: InvoiceCurrency;
  total: number;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  sent_at: string | null;
  usd_iqd_rate: number;
  client_id: string | null;
  clients: { name: string } | { name: string }[] | null;
};

function clientName(c: RawInvoice['clients']): string | null {
  if (!c) return null;
  return Array.isArray(c) ? (c[0]?.name ?? null) : c.name;
}

/** Sum payments per invoice id. */
async function paidByInvoice(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data } = await supabase.from('invoice_payments').select('invoice_id, amount');
  const map: Record<string, number> = {};
  for (const p of (data ?? []) as Array<{ invoice_id: string; amount: number }>) {
    map[p.invoice_id] = (map[p.invoice_id] ?? 0) + Number(p.amount);
  }
  return map;
}

/** All invoices, newest first, with client name and paid-so-far folded in. */
export async function getInvoices(supabase: SupabaseClient): Promise<InvoiceListRow[]> {
  const [{ data }, paid] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'id, number, currency, total, status, issue_date, due_date, sent_at, usd_iqd_rate, client_id, clients(name)'
      )
      .order('seq', { ascending: false }),
    paidByInvoice(supabase),
  ]);
  return ((data as RawInvoice[]) ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    currency: r.currency,
    total: Number(r.total),
    status: r.status,
    issue_date: r.issue_date,
    due_date: r.due_date,
    sent_at: r.sent_at,
    usd_iqd_rate: Number(r.usd_iqd_rate),
    client_id: r.client_id,
    client_name: clientName(r.clients),
    paid: paid[r.id] ?? 0,
  }));
}

/** A single invoice with items, client, and its payments. */
export async function getInvoice(
  supabase: SupabaseClient,
  id: string
): Promise<InvoiceDetail | null> {
  const { data } = await supabase
    .from('invoices')
    .select(
      'id, number, currency, total, subtotal, discount, status, issue_date, due_date, sent_at, usd_iqd_rate, client_id, items, notes, public_token, pdf_path, document_id, created_at, clients(id, name, phone, email, notes)'
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const raw = data as RawInvoice & {
    subtotal: number;
    discount: number;
    items: InvoiceItem[];
    notes: string | null;
    public_token: string | null;
    pdf_path: string | null;
    document_id: string | null;
    created_at: string;
    clients: ClientRow | ClientRow[] | null;
  };

  const { data: pays } = await supabase
    .from('invoice_payments')
    .select('id, invoice_id, amount, currency, paid_on, method, note, created_at')
    .eq('invoice_id', id)
    .order('paid_on', { ascending: true })
    .order('created_at', { ascending: true });
  const payments = ((pays as InvoicePaymentRow[]) ?? []).map((p) => ({
    ...p,
    amount: Number(p.amount),
  }));
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const client = Array.isArray(raw.clients) ? (raw.clients[0] ?? null) : raw.clients;

  return {
    id: raw.id,
    number: raw.number,
    currency: raw.currency,
    total: Number(raw.total),
    subtotal: Number(raw.subtotal),
    discount: Number(raw.discount),
    status: raw.status,
    issue_date: raw.issue_date,
    due_date: raw.due_date,
    sent_at: raw.sent_at,
    usd_iqd_rate: Number(raw.usd_iqd_rate),
    client_id: raw.client_id,
    client_name: client?.name ?? null,
    items: Array.isArray(raw.items) ? raw.items : [],
    notes: raw.notes,
    public_token: raw.public_token,
    pdf_path: raw.pdf_path,
    document_id: raw.document_id,
    created_at: raw.created_at,
    paid,
    client: (client as ClientRow) ?? null,
    payments,
  };
}

/** An invoice's total and paid-so-far expressed in integer IQD (for insights). */
export function invoiceIqd(row: {
  total: number;
  paid: number;
  currency: InvoiceCurrency;
  usd_iqd_rate: number;
}): { total: number; paid: number } {
  return {
    total: toIqd(row.total, row.currency, row.usd_iqd_rate),
    paid: toIqd(row.paid, row.currency, row.usd_iqd_rate),
  };
}
