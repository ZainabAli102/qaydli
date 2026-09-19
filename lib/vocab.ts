// Per-business vocabulary + memory, loaded for the parsers, the Review prefill,
// and (optionally) transcription biasing. RLS-scoped via the caller's client.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientLike, AliasLike, ItemPhraseLike, VocabLike } from '@/lib/memory';

export interface BusinessVocab {
  clients: ClientLike[];
  aliases: AliasLike[];
  itemPhrases: ItemPhraseLike[];
  categoryVocab: VocabLike[];
  /** Distinct real-word terms (client/vendor names, item descriptions) for
   *  "known names" prompt hints and speech biasing. Deduped, trimmed. */
  words: string[];
}

function dedupeWords(...groups: Array<Array<string | null | undefined>>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    for (const raw of g) {
      const w = (raw ?? '').trim();
      if (!w || w.length > 48) continue;
      const key = w.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
      if (out.length >= 120) return out;
    }
  }
  return out;
}

export async function buildBusinessVocab(supabase: SupabaseClient): Promise<BusinessVocab> {
  const [clientsR, aliasesR, itemsR, vocabR, vendorsR] = await Promise.all([
    supabase.from('clients').select('id, name').limit(500),
    supabase.from('client_aliases').select('alias_norm, client_id').limit(1000),
    supabase
      .from('item_phrases')
      .select('phrase_norm, description, unit_price')
      .order('uses', { ascending: false })
      .limit(200),
    supabase
      .from('category_vocab')
      .select('phrase_norm, category, uses')
      .order('uses', { ascending: false })
      .limit(300),
    supabase.from('transactions').select('vendor').not('vendor', 'is', null).limit(500),
  ]);

  const clients = (clientsR.data as ClientLike[]) ?? [];
  const aliases = (aliasesR.data as AliasLike[]) ?? [];
  const itemPhrases = ((itemsR.data as ItemPhraseLike[]) ?? []).map((p) => ({
    ...p,
    unit_price: Number(p.unit_price),
  }));
  const categoryVocab = (vocabR.data as VocabLike[]) ?? [];
  const vendors = ((vendorsR.data as Array<{ vendor: string | null }>) ?? []).map((v) => v.vendor);

  const words = dedupeWords(
    clients.map((c) => c.name),
    itemPhrases.map((p) => p.description),
    vendors
  );

  return { clients, aliases, itemPhrases, categoryVocab, words };
}
