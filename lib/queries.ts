// Server-side data helpers. Each takes an authenticated Supabase client so RLS
// scopes everything to the caller's business.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, PaymentMethod } from '@/lib/domain';

export interface TxnRow {
  id: string;
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

/** Transactions whose occurred_on falls in [monthStart, nextMonthStart). */
export async function getMonthTransactions(
  supabase: SupabaseClient,
  monthStart: string,
  nextMonthStart: string
): Promise<TxnRow[]> {
  const { data } = await supabase
    .from('transactions')
    .select(
      'id, vendor, category, payment_method, direction, amount, original_amount, original_currency, occurred_on, notes, created_at'
    )
    .gte('occurred_on', monthStart)
    .lt('occurred_on', nextMonthStart)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  return (data as TxnRow[]) ?? [];
}
