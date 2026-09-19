// Pure per-business memory matching (no I/O). Given the owner's saved aliases,
// item phrases and category vocabulary, resolve a spoken/typed value to what
// they meant. Everything here is unit-tested (tests/memory.test.ts).

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const a = AR_DIGITS.indexOf(d);
    if (a >= 0) return String(a);
    const f = FA_DIGITS.indexOf(d);
    return f >= 0 ? String(f) : d;
  });
}

/**
 * Normalise a phrase for matching: Latin digits, lowercase, common Arabic
 * letter folds (alef forms, ة→ه, ى→ي), diacritics stripped, punctuation → space,
 * whitespace collapsed. Latin and Arabic/Kurdish both survive.
 */
export function normalizePhrase(s: string | null | undefined): string {
  return toLatinDigits(String(s ?? ''))
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics + tatweel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur.push(Math.min(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between two already-normalized strings (1 = identical). */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / max;
}

export interface ClientLike {
  id: string;
  name: string;
}
export interface AliasLike {
  alias_norm: string;
  client_id: string;
}

/**
 * Resolve a spoken/typed client name to an existing client id:
 *   saved alias (exact) → exact name → fuzzy name (≥ threshold) → null.
 * A short spoken name that is a token-subset of a client name also matches.
 */
export function bestClientMatch(
  spoken: string | null | undefined,
  clients: ClientLike[],
  aliases: AliasLike[] = [],
  threshold = 0.82
): string | null {
  const q = normalizePhrase(spoken);
  if (!q) return null;

  const alias = aliases.find((a) => a.alias_norm === q);
  if (alias) return alias.client_id;

  let best: { id: string; score: number } | null = null;
  const qTokens = q.split(' ').filter(Boolean);
  for (const c of clients) {
    const n = normalizePhrase(c.name);
    if (!n) continue;
    if (n === q) return c.id;
    let score = similarity(q, n);
    // Whole-word containment (e.g. "hawler" inside "hawler international school").
    const nTokens = n.split(' ').filter(Boolean);
    const subset = qTokens.length > 0 && qTokens.every((t) => nTokens.includes(t));
    if (subset) score = Math.max(score, 0.9);
    if (!best || score > best.score) best = { id: c.id, score };
  }
  return best && best.score >= threshold ? best.id : null;
}

export interface ItemPhraseLike {
  phrase_norm: string;
  description: string;
  unit_price: number;
}

/** Match an item description to a remembered phrase (exact → fuzzy ≥ threshold). */
export function matchItemPhrase(
  description: string | null | undefined,
  phrases: ItemPhraseLike[],
  threshold = 0.85
): ItemPhraseLike | null {
  const q = normalizePhrase(description);
  if (!q) return null;
  let best: { row: ItemPhraseLike; score: number } | null = null;
  for (const p of phrases) {
    if (p.phrase_norm === q) return p;
    const score = similarity(q, p.phrase_norm);
    if (!best || score > best.score) best = { row: p, score };
  }
  return best && best.score >= threshold ? best.row : null;
}

export interface VocabLike {
  phrase_norm: string;
  category: string;
  uses?: number;
}

/**
 * Map free text (vendor/description) to a learned category slug. Prefers an
 * exact phrase match, else the most-used vocabulary phrase contained in the
 * text as a whole token run. Returns null when nothing is learned yet.
 */
export function lookupCategoryVocab(text: string | null | undefined, vocab: VocabLike[]): string | null {
  const q = normalizePhrase(text);
  if (!q) return null;
  const padded = ` ${q} `;
  let best: { category: string; uses: number; len: number } | null = null;
  for (const v of vocab) {
    const p = v.phrase_norm;
    if (!p) continue;
    const hit = q === p || padded.includes(` ${p} `);
    if (!hit) continue;
    const uses = v.uses ?? 1;
    // Prefer more-used, then longer (more specific) phrases.
    if (!best || uses > best.uses || (uses === best.uses && p.length > best.len)) {
      best = { category: v.category, uses, len: p.length };
    }
  }
  return best ? best.category : null;
}
