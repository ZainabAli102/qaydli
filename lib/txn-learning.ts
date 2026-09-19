// Plain server module (not a 'use server' file) so it can export sync/async
// helpers freely. Captures a transaction save into the learning loop.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  recordCorrections,
  learnCategoryVocab,
  learnItemPhrases,
  type LearnMeta,
} from '@/lib/corrections';

/** The subset of a transaction save the learning loop needs (structural). */
export interface TxnLearnInput {
  vendor: string;
  date: string;
  currency: string;
  total: number;
  category: string;
  paymentMethod: string;
  type: string;
  lineItems: Array<{ description: string; qty: number | null; unit_price: number | null; line_total: number | null }>;
}

/** Capture corrections (when the AI prefilled anything) and reinforce memory. */
export async function learnFromTxn(
  supabase: SupabaseClient,
  businessId: string,
  input: TxnLearnInput,
  learn?: LearnMeta
): Promise<void> {
  try {
    if (learn) {
      const finalMap: Record<string, string> = {
        vendor: input.vendor ?? '',
        date: input.date ?? '',
        currency: input.currency,
        total: String(input.total ?? ''),
        category: input.category,
        payment_method: input.paymentMethod,
        type: input.type,
      };
      await recordCorrections(supabase, businessId, learn, finalMap);
    }
    // Vocabulary is learned from every save with a vendor (not only corrections).
    await learnCategoryVocab(supabase, input.vendor, input.category);
    await learnItemPhrases(supabase, input.lineItems);
  } catch (err) {
    console.error('[learnFromTxn] failed:', err);
  }
}
