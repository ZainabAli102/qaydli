// Month/date helpers. Book dates live in the `occurred_on` DATE column, which
// has no time or timezone, so month filtering is plain 'YYYY-MM-DD' string
// comparison (timezone-independent and correct). Timezone only matters for
// deciding "today"/"this month", which we anchor to Asia/Baghdad — the app's
// market — so a receipt saved near midnight lands in the right local month.

export const APP_TZ = 'Asia/Baghdad';

const p2 = (n: number) => String(n).padStart(2, '0');

/** Today's date as 'YYYY-MM-DD' in the given IANA timezone. */
export function todayISO(tz: string = APP_TZ, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The current month 'YYYY-MM' in the given timezone. */
export function currentMonth(tz: string = APP_TZ, now: Date = new Date()): string {
  return todayISO(tz, now).slice(0, 7);
}

export function isMonth(v: string | undefined | null): v is string {
  return !!v && /^\d{4}-\d{2}$/.test(v);
}

export interface MonthRange {
  start: string; // inclusive 'YYYY-MM-01'
  nextStart: string; // exclusive first day of next month
  prev: string; // 'YYYY-MM' of previous month
  next: string; // 'YYYY-MM' of next month
}

/**
 * Half-open range [start, nextStart) for a 'YYYY-MM' month, plus the adjacent
 * month keys. A DATE `occurred_on` is in the month iff start <= occurred_on <
 * nextStart under ordinary string comparison.
 */
export function monthRange(ym: string): MonthRange {
  const [y, m] = ym.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return {
    start: `${y}-${p2(m)}-01`,
    nextStart: `${nextY}-${p2(nextM)}-01`,
    prev: `${prevY}-${p2(prevM)}`,
    next: `${nextY}-${p2(nextM)}`,
  };
}

/** Add `delta` months to a 'YYYY-MM' key (delta may be negative). */
export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12;
  return `${ny}-${p2(nm + 1)}`;
}

/** The N month keys ending at `ym`, oldest first (e.g. 6 → [ym-5 … ym]). */
export function lastMonths(ym: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(ym, -(n - 1 - i)));
}

/** The 'YYYY-MM' a date string belongs to; falls back to the current month. */
export function monthOf(
  dateStr: string | null | undefined,
  tz: string = APP_TZ,
  now: Date = new Date()
): string {
  if (dateStr && /^\d{4}-\d{2}/.test(dateStr)) return dateStr.slice(0, 7);
  return currentMonth(tz, now);
}
