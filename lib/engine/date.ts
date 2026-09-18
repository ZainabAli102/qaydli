// Parse the authoritative `date` from `date_raw` in code (not in the model).
// Region convention is DD/MM; a missing year is filled from opts.now. Pure.

import type { Flag, ReceiptResult } from './types';
import { normalizeDigits } from './schema';

export interface ParsedDate {
  iso: string | null;
  yearInferred: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Parse a raw date string (any script) into ISO YYYY-MM-DD. Assumes DD/MM order;
 * a 2-digit year expands to 2000+; a missing year is taken from `now`.
 */
export function parseDateRaw(raw: string | null, now: Date): ParsedDate {
  if (!raw) return { iso: null, yearInferred: false };
  const groups = normalizeDigits(raw).match(/\d+/g);
  if (!groups || groups.length < 2) return { iso: null, yearInferred: false };

  let d: number;
  let m: number;
  let y: number;
  let yearInferred = false;

  if (groups.length >= 3) {
    if (groups[0].length === 4) {
      // ISO-ish YYYY/MM/DD
      [y, m, d] = [Number(groups[0]), Number(groups[1]), Number(groups[2])];
    } else {
      // DD/MM/YYYY or DD/MM/YY
      d = Number(groups[0]);
      m = Number(groups[1]);
      y = Number(groups[2]);
      if (groups[2].length <= 2) y = 2000 + y;
    }
  } else {
    // Two groups: DD/MM, year missing.
    d = Number(groups[0]);
    m = Number(groups[1]);
    y = now.getUTCFullYear();
    yearInferred = true;
  }

  // If day and month look swapped (month > 12 but day <= 12), swap them.
  if (m > 12 && d <= 12) [d, m] = [m, d];

  if (!isRealDate(y, m, d)) return { iso: null, yearInferred };
  return { iso: `${y}-${pad(m)}-${pad(d)}`, yearInferred };
}

/**
 * Overwrite result.date from result.date_raw, filling a missing year from `now`
 * and flagging what happened. Returns a new result; does not mutate the input.
 */
export function applyDateFromRaw(result: ReceiptResult, now: Date): ReceiptResult {
  const raw = result.date_raw.value;
  if (!raw) return result; // nothing to parse from; keep whatever the model gave

  const { iso, yearInferred } = parseDateRaw(raw, now);
  const flags: Flag[] = [...result.flags];
  const addFlag = (code: string, message: string) => {
    if (!flags.some((f) => f.code === code)) flags.push({ code, message, severity: 'warn' });
  };

  let date = result.date;
  if (iso) {
    date = {
      value: iso,
      confidence: Math.min(1, result.date_raw.confidence * (yearInferred ? 0.8 : 1)),
    };
    if (yearInferred) addFlag('date_year_missing', `Year missing in "${raw}"; filled from current date.`);
  } else {
    date = { value: null, confidence: 0 };
    addFlag('date_uncertain', `Could not parse the date from "${raw}".`);
  }

  return { ...result, date, flags };
}
