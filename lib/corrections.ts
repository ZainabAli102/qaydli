// Server-side capture for the learning loop: record the owner's corrections to
// the AI's suggestions, and reinforce the per-business memories. All writes are
// RLS-scoped (the caller's user client). Best-effort — never blocks a save.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhrase } from '@/lib/memory';

export type CorrectionSource = 'scan' | 'describe' | 'voice' | 'manual';

/** What the AI/prefill proposed, so a save can diff it against the final. */
export interface LearnMeta {
  source: CorrectionSource;
  language: string;
  modelUsed: string | null;
  /** field → the value that was prefilled (string form), or null if none. */
  ai: Record<string, string | null>;
}

const norm = (v: string | null | undefined) => normalizePhrase(v);

/** Insert a correction row for each field whose final value differs from the AI's. */
export async function recordCorrections(
  supabase: SupabaseClient,
  businessId: string,
  meta: LearnMeta,
  final: Record<string, string>
): Promise<number> {
  const rows: Array<Record<string, unknown>> = [];
  for (const [field, finalVal] of Object.entries(final)) {
    const aiVal = meta.ai[field];
    if (aiVal == null || aiVal === '') continue; // nothing suggested → not a correction
    if (norm(aiVal) === norm(finalVal)) continue; // unchanged
    rows.push({
      business_id: businessId,
      source: meta.source,
      field,
      ai_value: aiVal,
      final_value: finalVal,
      language: meta.language || null,
      model_used: meta.modelUsed,
    });
  }
  if (rows.length) {
    const { error } = await supabase.from('corrections').insert(rows);
    if (error) console.error('[corrections] insert failed:', error.message);
  }
  return rows.length;
}

/** Learn: this vendor/phrase → this category (increments on repeat). */
export async function learnCategoryVocab(
  supabase: SupabaseClient,
  phrase: string | null | undefined,
  category: string | null | undefined
): Promise<void> {
  const p = norm(phrase);
  if (!p || !category) return;
  const { error } = await supabase.rpc('learn_category_vocab', { p_phrase: p, p_category: category });
  if (error) console.error('[learn.category] failed:', error.message);
}

/** Learn item phrases (description → unit price) from a set of line items. */
export async function learnItemPhrases(
  supabase: SupabaseClient,
  items: Array<{ description: string | null; unit_price: number | null }>
): Promise<void> {
  for (const it of items) {
    const p = norm(it.description);
    if (!p || !it.unit_price || it.unit_price <= 0) continue;
    const { error } = await supabase.rpc('learn_item_phrase', {
      p_phrase: p,
      p_desc: (it.description ?? '').trim(),
      p_price: it.unit_price,
    });
    if (error) console.error('[learn.item] failed:', error.message);
  }
}

/** Learn an alias only when the spoken/typed name differs from the real name. */
export async function learnClientAlias(
  supabase: SupabaseClient,
  spokenName: string | null | undefined,
  clientId: string | null | undefined,
  clientName: string | null | undefined
): Promise<void> {
  const alias = norm(spokenName);
  if (!alias || !clientId) return;
  if (clientName && norm(clientName) === alias) return; // already spelled the same
  const { error } = await supabase.rpc('learn_client_alias', { p_alias: alias, p_client: clientId });
  if (error) console.error('[learn.alias] failed:', error.message);
}
