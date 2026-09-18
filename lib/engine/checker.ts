// Maths checker. The model reads figures; CODE decides whether they add up.
//
// Rules (from the spec):
//  - Try the line items two ways — unit_price x qty, and the printed line_total
//    summed — and pass if EITHER lands within 1% of the total (or subtotal).
//  - Cross-check the total against an amount written in words when we can read
//    one (English words supported in code; Arabic/Kurdish words are reconciled
//    by the model and surfaced via notes/flags).
//  - Flag conflicts (e.g. a USD price with IQD paid, or $10 and 15,000 both
//    present) rather than guessing a reconciliation.
//  - Downgrade the confidence of any field involved in a failed check.

import type { Confident, Flag, ReceiptResult } from './types';

const TOLERANCE = 0.01; // 1%

function within(value: number, target: number): boolean {
  if (target === 0) return Math.abs(value) < 1e-9;
  return Math.abs(value - target) <= TOLERANCE * Math.abs(target);
}

function downgrade<T>(c: Confident<T>, factor = 0.6): Confident<T> {
  return { value: c.value, confidence: Math.max(0, Math.min(1, c.confidence * factor)) };
}

/** Sum a projection over line items, ignoring items where inputs are missing. */
function sumItems(
  result: ReceiptResult,
  pick: (item: ReceiptResult['line_items'][number]) => number | null
): number | null {
  let sum = 0;
  let counted = 0;
  for (const item of result.line_items) {
    const v = pick(item);
    if (v !== null && Number.isFinite(v)) {
      sum += v;
      counted += 1;
    }
  }
  return counted > 0 ? sum : null;
}

// Minimal English spelled-number parser for the amount-in-words cross-check.
const WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const WORD_SCALES: Record<string, number> = {
  hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000,
};

/** Parse a run of English number words to a number, or null if none found. */
export function wordsToNumberEn(text: string): number | null {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w in WORD_VALUES || w in WORD_SCALES || w === 'and');

  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const tok of tokens) {
    if (tok === 'and') continue;
    if (tok in WORD_VALUES) {
      current += WORD_VALUES[tok];
      sawNumber = true;
    } else if (tok === 'hundred') {
      current = (current || 1) * 100;
      sawNumber = true;
    } else {
      // thousand / million / billion
      total += (current || 1) * WORD_SCALES[tok];
      current = 0;
      sawNumber = true;
    }
  }
  return sawNumber ? total + current : null;
}

function hasFlag(flags: Flag[], code: string): boolean {
  return flags.some((f) => f.code === code);
}

/**
 * Verify a ReceiptResult's arithmetic. Returns a NEW result with any conflict
 * flags added and affected confidences reduced. Pure: no I/O, no mutation.
 */
export function runChecks(input: ReceiptResult): ReceiptResult {
  // Shallow clone with fresh confident objects we might downgrade.
  const r: ReceiptResult = {
    ...input,
    subtotal: { ...input.subtotal },
    total: { ...input.total },
    line_items: input.line_items.map((i) => ({ ...i })),
    flags: [...input.flags],
  };

  const addFlag = (code: string, message: string, severity: Flag['severity'] = 'warn') => {
    if (!hasFlag(r.flags, code)) r.flags.push({ code, message, severity });
  };

  const total = r.total.value;
  const subtotal = r.subtotal.value;
  const discount = r.discount.value ?? 0;

  // --- 1. Line items vs total/subtotal -------------------------------------
  const byUnitQty = sumItems(r, (i) =>
    i.unit_price !== null && i.qty !== null ? i.unit_price * i.qty : null
  );
  const byLineTotal = sumItems(r, (i) => i.line_total);

  const lineTarget = subtotal ?? total;
  if (lineTarget !== null && (byUnitQty !== null || byLineTotal !== null)) {
    const matched =
      (byUnitQty !== null && within(byUnitQty, lineTarget)) ||
      (byLineTotal !== null && within(byLineTotal, lineTarget));

    if (matched) {
      addFlag('math_ok', 'Line items reconcile with the total within 1%.', 'info');
    } else {
      addFlag(
        'line_items_mismatch',
        `Line items (unit x qty = ${byUnitQty ?? 'n/a'}, sum of line totals = ${
          byLineTotal ?? 'n/a'
        }) do not match ${subtotal !== null ? 'subtotal' : 'total'} ${lineTarget} within 1%.`,
        'warn'
      );
      r.total = downgrade(r.total);
      r.subtotal = downgrade(r.subtotal);
      r.line_items = r.line_items.map((i) => ({
        ...i,
        confidence: Math.max(0, i.confidence * 0.6),
      }));
    }
  }

  // --- 2. subtotal - discount = total --------------------------------------
  if (subtotal !== null && total !== null) {
    if (!within(subtotal - discount, total)) {
      addFlag(
        'total_mismatch',
        `subtotal ${subtotal} minus discount ${discount} does not equal total ${total} within 1%.`,
        'warn'
      );
      r.total = downgrade(r.total);
    }
  }

  // --- 3. Amount in words (English) cross-check ----------------------------
  const words = wordsToNumberEn(r.notes.value ?? '');
  if (words !== null && total !== null && words > 0) {
    if (!within(words, total)) {
      addFlag(
        'amount_in_words_mismatch',
        `Amount in words (~${words}) does not match the total ${total} within 1%.`,
        'warn'
      );
      r.total = downgrade(r.total);
    }
  }

  // --- 4. Currency conflict ------------------------------------------------
  const priceCur = r.currency.value;
  const paidCur = r.paid_currency.value;
  const paid = r.paid_amount.value;
  const mixed =
    priceCur === 'mixed' || (paidCur !== null && paid !== null && paidCur !== priceCur);

  if (mixed) {
    addFlag(
      'currency_conflict',
      `Two currencies present without a clear reconciliation (price ${priceCur}` +
        `${total !== null ? ' ' + total : ''}, paid ${paidCur ?? '?'}` +
        `${paid !== null ? ' ' + paid : ''}). Not reconciled automatically.`,
      'warn'
    );
    r.currency = downgrade(r.currency, 0.7);
  }

  return r;
}
