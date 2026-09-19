// Pure learning-loop analytics: how much the app learned and how often the
// owner had to correct it. No I/O — callers pass in rows loaded from Supabase.
// Used by the owner's Insights line and the admin accuracy endpoint.

/** A correction row (only the fields the metrics need). */
export interface CorrectionRow {
  field: string;
  ai_value: string | null;
  final_value: string | null;
  created_at: string;
}

/** An entry (transaction) row — created_at is enough to count and bucket it. */
export interface EntryRow {
  created_at: string;
}

/**
 * Corrections from one save are inserted together and share a created_at, so
 * the count of distinct timestamps (to the second) approximates the number of
 * ENTRIES that needed at least one correction.
 */
export function correctedEntryCount(corrections: CorrectionRow[]): number {
  const seen = new Set<string>();
  for (const c of corrections) seen.add(toSecond(c.created_at));
  return seen.size;
}

function toSecond(iso: string): string {
  // 'YYYY-MM-DDTHH:MM:SS' — drop sub-second precision and zone jitter.
  return String(iso).slice(0, 19);
}

/**
 * ISO-8601 week key 'YYYY-Www' (weeks start Monday). Stable, sortable, and
 * locale-independent — good for a trend axis.
 */
export function isoWeekKey(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  // Shift to the Thursday of this week, then week 1 is the week with Jan 4th.
  const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface WeekBucket {
  week: string; // 'YYYY-Www'
  entries: number;
  fieldsCorrected: number;
  perEntry: number; // fieldsCorrected / entries (0 when no entries)
}

/**
 * Weekly "fields corrected per entry": for each ISO week, how many entries were
 * created and how many correction rows landed. Sorted oldest → newest.
 */
export function weeklyAccuracy(entries: EntryRow[], corrections: CorrectionRow[]): WeekBucket[] {
  const byWeek = new Map<string, { entries: number; fieldsCorrected: number }>();
  const bump = (week: string, key: 'entries' | 'fieldsCorrected') => {
    if (!week) return;
    const b = byWeek.get(week) ?? { entries: 0, fieldsCorrected: 0 };
    b[key] += 1;
    byWeek.set(week, b);
  };
  for (const e of entries) bump(isoWeekKey(e.created_at), 'entries');
  for (const c of corrections) bump(isoWeekKey(c.created_at), 'fieldsCorrected');

  return [...byWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([week, b]) => ({
      week,
      entries: b.entries,
      fieldsCorrected: b.fieldsCorrected,
      perEntry: b.entries > 0 ? b.fieldsCorrected / b.entries : 0,
    }));
}

export interface CorrectionPattern {
  field: string;
  ai_value: string;
  final_value: string;
  count: number;
}

/**
 * The most frequent (field, ai_value → final_value) corrections — the app's
 * recurring mistakes, most common first. Ties broken alphabetically so the
 * output is deterministic.
 */
export function topCorrectionPatterns(corrections: CorrectionRow[], limit = 20): CorrectionPattern[] {
  const counts = new Map<string, CorrectionPattern>();
  for (const c of corrections) {
    const ai = c.ai_value ?? '';
    const final = c.final_value ?? '';
    const key = `${c.field}\u0000${ai}\u0000${final}`;
    const row = counts.get(key);
    if (row) row.count += 1;
    else counts.set(key, { field: c.field, ai_value: ai, final_value: final, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || cmp(a.field, b.field) || cmp(a.ai_value, b.ai_value))
    .slice(0, Math.max(0, limit));
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
