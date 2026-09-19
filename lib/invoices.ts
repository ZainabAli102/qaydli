// Pure invoice logic — no I/O, no formatting side effects. Numbers in the
// invoice's own currency (IQD or USD); conversion to the integer-IQD ledger
// happens elsewhere (record_invoice_payment). Everything here is unit-tested.

export type InvoiceCurrency = 'IQD' | 'USD';

/** Brand teal — the default invoice accent. */
export const DEFAULT_ACCENT = '#0f766e';

/** Preset accent swatches offered in Settings (owner can also type a hex). */
export const ACCENT_PRESETS = [
  '#0f766e', // teal (brand)
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // gold
  '#16a34a', // green
  '#0f172a', // slate/near-black
] as const;

/** Validate/normalise a hex colour, else fall back. Accepts #rgb or #rrggbb. */
export function normalizeHex(v: string | null | undefined, fallback = DEFAULT_ACCENT): string {
  const s = (v ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
  }
  return fallback;
}

/** Stored base status. 'overdue' is derived on read, never persisted. */
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid';
export type DisplayStatus = InvoiceStatus | 'overdue';

export interface InvoiceItem {
  description: string;
  qty: number;
  unit_price: number;
}

/** qty × unit_price for one line, guarding against non-finite input. */
export function lineTotal(item: { qty: number; unit_price: number }): number {
  const q = Number(item.qty);
  const p = Number(item.unit_price);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return q * p;
}

/** Sum the lines and apply the discount. Discount is clamped to [0, subtotal]. */
export function computeTotals(
  items: Array<{ qty: number; unit_price: number }>,
  discount = 0
): { subtotal: number; discount: number; total: number } {
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const d = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  return { subtotal, discount: d, total: subtotal - d };
}

/** Per-business number from its numeric sequence: 1 → "INV-001", 42 → "INV-042". */
export function formatInvoiceNumber(seq: number): string {
  return `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;
}

/** Standard due-in options plus a custom date. */
export const DUE_PRESETS = [7, 14, 30] as const;

/** issue_date + `days`, as an ISO 'YYYY-MM-DD' string. */
export function dueDateFrom(issueDateISO: string, days: number): string {
  const d = new Date(`${issueDateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Derive the stored base status from payment state:
 *   paid >= total (and total > 0) → 'paid'
 *   0 < paid < total             → 'partial'
 *   paid == 0, was sent          → 'sent'
 *   otherwise                    → 'draft'
 * Overdue is layered on at display time (isOverdue), not stored here.
 */
export function deriveStatus(opts: {
  total: number;
  paid: number;
  sent: boolean;
}): InvoiceStatus {
  if (opts.total > 0 && opts.paid >= opts.total) return 'paid';
  if (opts.paid > 0) return 'partial';
  return opts.sent ? 'sent' : 'draft';
}

/** Unpaid (sent or partial) and past the due date, by 'YYYY-MM-DD' comparison. */
export function isOverdue(opts: {
  status: InvoiceStatus;
  dueDate: string | null;
  today: string;
}): boolean {
  if (opts.status !== 'sent' && opts.status !== 'partial') return false;
  if (!opts.dueDate) return false;
  return opts.today > opts.dueDate;
}

/** The status to show the owner/client, with overdue layered on sent/partial. */
export function displayStatus(opts: {
  status: InvoiceStatus;
  dueDate: string | null;
  today: string;
}): DisplayStatus {
  return isOverdue(opts) ? 'overdue' : opts.status;
}

/** Whole days from issue/paid dates — used for "average days to get paid". */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Portfolio stats for Insights. Amounts must be pre-converted to a single
 * currency (integer IQD) by the caller so figures across IQD/USD invoices add up.
 */
export interface InvoiceSummaryLike {
  total: number; // IQD
  paid: number; // IQD
  status: InvoiceStatus;
  dueDate: string | null;
  issueDate: string;
  paidOnDate: string | null; // date the invoice became fully paid, else null
}

export function invoiceStats(
  rows: InvoiceSummaryLike[],
  today: string
): { owed: number; overdue: number; avgDaysToPay: number | null } {
  let owed = 0;
  let overdue = 0;
  const payDays: number[] = [];
  for (const r of rows) {
    const outstanding = Math.max(0, r.total - r.paid);
    if (r.status !== 'paid') owed += outstanding;
    if (isOverdue({ status: r.status, dueDate: r.dueDate, today })) overdue += outstanding;
    if (r.status === 'paid' && r.paidOnDate) {
      payDays.push(Math.max(0, daysBetween(r.issueDate, r.paidOnDate)));
    }
  }
  const avgDaysToPay =
    payDays.length > 0 ? Math.round(payDays.reduce((a, b) => a + b, 0) / payDays.length) : null;
  return { owed, overdue, avgDaysToPay };
}

/** The list tabs and which display-statuses each one shows. */
export type InvoiceTab = 'all' | 'due' | 'overdue' | 'paid';

export function matchesTab(tab: InvoiceTab, display: DisplayStatus): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'due': // owes you money and not yet fully paid (sent/partial/overdue)
      return display === 'sent' || display === 'partial' || display === 'overdue';
    case 'overdue':
      return display === 'overdue';
    case 'paid':
      return display === 'paid';
  }
}
