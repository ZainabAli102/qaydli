// Server-side data helpers. Each takes an authenticated Supabase client so RLS
// scopes everything to the caller's business.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, PaymentMethod } from '@/lib/domain';

export interface TxnRow {
  id: string;
  document_id: string | null;
  vendor: string | null;
  category: Category | null;
  payment_method: PaymentMethod | null;
  direction: 'in' | 'out';
  amount: number; // integer IQD
  original_amount: number | null;
  original_currency: string | null;
  occurred_on: string | null;
  notes: string | null;
  created_at: string;
}

/** Total number of saved transactions in the business (for the free trial). */
export async function getEntryCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

/** Last category + payment method the owner used for this vendor, if any. */
export async function getVendorMemory(
  supabase: SupabaseClient,
  vendor: string | null
): Promise<{ category: Category | null; payment_method: PaymentMethod | null } | null> {
  if (!vendor) return null;
  const { data } = await supabase.rpc('vendor_memory', { p_vendor: vendor });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    category: (row.category as Category) ?? null,
    payment_method: (row.payment_method as PaymentMethod) ?? null,
  };
}

export interface TxnFull extends TxnRow {
  document_id: string | null;
}

/** A single transaction (RLS-scoped), including its document link. */
export async function getTransaction(
  supabase: SupabaseClient,
  id: string
): Promise<TxnFull | null> {
  const { data } = await supabase
    .from('transactions')
    .select(
      'id, document_id, vendor, category, payment_method, direction, amount, original_amount, original_currency, occurred_on, notes, created_at'
    )
    .eq('id', id)
    .maybeSingle();
  return (data as TxnFull) ?? null;
}

/** All transactions in the business, newest first (for the "All time" view). */
export async function getAllTransactions(supabase: SupabaseClient): Promise<TxnRow[]> {
  const { data } = await supabase
    .from('transactions')
    .select(
      'id, document_id, vendor, category, payment_method, direction, amount, original_amount, original_currency, occurred_on, notes, created_at'
    )
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  return (data as TxnRow[]) ?? [];
}

/** Transactions in [start, nextStart) — same as month query, clearer name. */
export async function getTransactionsBetween(
  supabase: SupabaseClient,
  start: string,
  nextStart: string
): Promise<TxnRow[]> {
  return getMonthTransactions(supabase, start, nextStart);
}

/** Owner overrides for recurring groups: { group_key: is_recurring }. */
export async function getRecurringOverrides(
  supabase: SupabaseClient
): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('recurring_marks').select('group_key, is_recurring');
  const map: Record<string, boolean> = {};
  for (const r of (data ?? []) as Array<{ group_key: string; is_recurring: boolean }>) {
    map[r.group_key] = r.is_recurring;
  }
  return map;
}

/** Transactions whose occurred_on falls in [monthStart, nextMonthStart). */
export async function getMonthTransactions(
  supabase: SupabaseClient,
  monthStart: string,
  nextMonthStart: string
): Promise<TxnRow[]> {
  const { data } = await supabase
    .from('transactions')
    .select(
      'id, document_id, vendor, category, payment_method, direction, amount, original_amount, original_currency, occurred_on, notes, created_at'
    )
    .gte('occurred_on', monthStart)
    .lt('occurred_on', nextMonthStart)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  return (data as TxnRow[]) ?? [];
}
