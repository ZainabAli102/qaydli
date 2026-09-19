// Pure save-time validation shared by the client forms and the server actions.
// Keeping it here (no I/O) means the browser blocks a bad save instantly and the
// server enforces the same rule as defence-in-depth — one source of truth.

export type ValidationCode = 'total_zero';

export interface TotalValidation {
  ok: boolean;
  /** Present only when ok === false. Maps to an i18n key (`validation.<code>`). */
  code?: ValidationCode;
}

const OK: TotalValidation = { ok: true };

/**
 * A book/invoice total must be a real positive number. Zero, empty (NaN/null),
 * and negative amounts are blocked — usually a receipt whose amount was never
 * read or typed.
 *
 * `allowZero` permits an *explicit* zero (an invoice the owner marked as a
 * credit note or fully discounted). It still blocks empty and negative values —
 * only exactly 0 becomes valid.
 */
export function validateTotal(
  total: number | null | undefined,
  opts: { allowZero?: boolean } = {}
): TotalValidation {
  // An absent value is "empty", never an intentional zero (Number(null) === 0).
  if (total == null) return { ok: false, code: 'total_zero' };
  const n = typeof total === 'number' ? total : Number(total);
  if (!Number.isFinite(n)) return { ok: false, code: 'total_zero' };
  if (n < 0) return { ok: false, code: 'total_zero' };
  if (n === 0) return opts.allowZero ? OK : { ok: false, code: 'total_zero' };
  return OK;
}
