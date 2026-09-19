// Pure analytics over transactions. No I/O, no formatting — integer IQD in,
// plain numbers out. The Insights page fetches rows and calls computeInsights;
// detectRecurring / detectUnusual are exported for unit tests.

export interface TxnLike {
  id: string;
  vendor: string | null;
  category: string | null;
  direction: 'in' | 'out';
  amount: number; // integer IQD
  occurred_on: string | null; // 'YYYY-MM-DD'
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function normVendor(v: string | null): string {
  return (v ?? '').trim().toLowerCase();
}

/** Delta percent (this vs last); null when last is 0 (no baseline). */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const mk = (t: TxnLike): string | null => (t.occurred_on ? t.occurred_on.slice(0, 7) : null);

// ---- recurring / fixed costs ----------------------------------------------
export interface RecurringGroup {
  key: string; // stable id for overrides, e.g. "v:mvk electric" or "c:rent"
  label: string; // display name (vendor or category slug)
  kind: 'vendor' | 'category';
  monthsPresent: number;
  monthlyAmount: number; // median monthly total
  auto: boolean; // auto-detected as recurring
  recurring: boolean; // effective (override ?? auto)
}

export interface RecurringResult {
  groups: RecurringGroup[]; // candidates (>= 2 months), highest monthly first
  fixedTotal: number; // sum of monthlyAmount over effective-recurring groups
}

/**
 * Recurring expense groups over `months` (ascending window). A group (by vendor,
 * else category) counts as fixed when it appears in >= minMonths of the window
 * with monthly totals all within `tolerance` of the median. Overrides
 * (key → boolean) let the owner force a group on/off.
 */
export function detectRecurring(
  txns: TxnLike[],
  months: string[],
  overrides: Record<string, boolean> = {},
  opts: { minMonths?: number; tolerance?: number } = {}
): RecurringResult {
  const minMonths = opts.minMonths ?? 3;
  const tolerance = opts.tolerance ?? 0.4;
  const inWindow = new Set(months);

  // group -> monthKey -> summed amount
  const groups = new Map<string, { label: string; kind: 'vendor' | 'category'; byMonth: Map<string, number> }>();
  for (const t of txns) {
    if (t.direction !== 'out') continue;
    const m = mk(t);
    if (!m || !inWindow.has(m)) continue;
    const v = normVendor(t.vendor);
    const key = v ? `v:${v}` : t.category ? `c:${t.category}` : null;
    if (!key) continue;
    const label = v ? (t.vendor as string) : (t.category as string);
    const kind: 'vendor' | 'category' = v ? 'vendor' : 'category';
    if (!groups.has(key)) groups.set(key, { label, kind, byMonth: new Map() });
    const g = groups.get(key)!;
    g.byMonth.set(m, (g.byMonth.get(m) ?? 0) + t.amount);
  }

  const result: RecurringGroup[] = [];
  let fixedTotal = 0;
  for (const [key, g] of groups) {
    const monthly = [...g.byMonth.values()];
    const monthsPresent = monthly.length;
    if (monthsPresent < 2) continue; // not a candidate at all
    const med = median(monthly);
    const similar = med > 0 && monthly.every((x) => Math.abs(x - med) <= tolerance * med);
    const auto = monthsPresent >= minMonths && similar;
    const recurring = overrides[key] ?? auto;
    if (recurring) fixedTotal += med;
    result.push({
      key,
      label: g.label,
      kind: g.kind,
      monthsPresent,
      monthlyAmount: med,
      auto,
      recurring,
    });
  }
  result.sort((a, b) => Number(b.recurring) - Number(a.recurring) || b.monthlyAmount - a.monthlyAmount);
  return { groups: result, fixedTotal };
}

// ---- unusual items ---------------------------------------------------------
export interface UnusualItem {
  id: string;
  vendor: string;
  amount: number;
  reason: 'high_for_category' | 'new_big_vendor';
}

/**
 * Flag expenses in `month` that are either > `categoryMultiplier`x the
 * category's median over `medianMonths`, or from a vendor never seen before this
 * month with amount > `vendorShare` of the month's total spend.
 */
export function detectUnusual(
  txns: TxnLike[],
  month: string,
  opts: { medianMonths?: number; categoryMultiplier?: number; vendorShare?: number } = {}
): UnusualItem[] {
  const medianMonths = opts.medianMonths ?? 3;
  const categoryMultiplier = opts.categoryMultiplier ?? 3;
  const vendorShare = opts.vendorShare ?? 0.1;

  // Median window = the last `medianMonths` months ending at `month`.
  const windowMonths = new Set(
    Array.from({ length: medianMonths }, (_, i) => {
      const [y, m] = month.split('-').map(Number);
      const total = y * 12 + (m - 1) - i;
      return `${Math.floor(total / 12)}-${String(((total % 12) + 12) % 12 + 1).padStart(2, '0')}`;
    })
  );

  const catAmounts = new Map<string, number[]>();
  const priorVendors = new Set<string>();
  const thisMonthExpenses: TxnLike[] = [];
  let monthSpend = 0;

  for (const t of txns) {
    if (t.direction !== 'out') continue;
    const m = mk(t);
    if (!m) continue;
    if (windowMonths.has(m)) {
      const c = t.category ?? 'other';
      if (!catAmounts.has(c)) catAmounts.set(c, []);
      catAmounts.get(c)!.push(t.amount);
    }
    if (m < month) priorVendors.add(normVendor(t.vendor));
    if (m === month) {
      thisMonthExpenses.push(t);
      monthSpend += t.amount;
    }
  }

  const catMedian = new Map<string, number>();
  for (const [c, arr] of catAmounts) catMedian.set(c, median(arr));

  const out: UnusualItem[] = [];
  for (const t of thisMonthExpenses) {
    const c = t.category ?? 'other';
    const med = catMedian.get(c) ?? 0;
    if (med > 0 && t.amount > categoryMultiplier * med) {
      out.push({ id: t.id, vendor: t.vendor ?? '', amount: t.amount, reason: 'high_for_category' });
      continue;
    }
    const v = normVendor(t.vendor);
    if (v && !priorVendors.has(v) && monthSpend > 0 && t.amount > vendorShare * monthSpend) {
      out.push({ id: t.id, vendor: t.vendor ?? '', amount: t.amount, reason: 'new_big_vendor' });
    }
  }
  out.sort((a, b) => b.amount - a.amount);
  return out;
}

// ---- full page bundle ------------------------------------------------------
export interface MonthTotals {
  in: number;
  out: number;
  profit: number;
}
export interface Insights {
  txnCount: number; // in the selected month
  thisMonth: MonthTotals;
  lastMonth: MonthTotals;
  delta: { in: number | null; out: number | null; profit: number | null };
  trend: Array<{ month: string; in: number; out: number; profit: number }>;
  categories: Array<{ category: string; amount: number; share: number; deltaPct: number | null }>;
  topVendors: Array<{ vendor: string; amount: number; count: number }>;
  recurring: RecurringResult;
  unusual: UnusualItem[];
}

function totalsFor(txns: TxnLike[], month: string): MonthTotals {
  let mIn = 0;
  let mOut = 0;
  for (const t of txns) {
    if (mk(t) !== month) continue;
    if (t.direction === 'in') mIn += t.amount;
    else mOut += t.amount;
  }
  return { in: mIn, out: mOut, profit: mIn - mOut };
}

export function computeInsights(
  txns: TxnLike[],
  opts: { month: string; months: string[]; recurringOverrides?: Record<string, boolean> }
): Insights {
  const { month, months } = opts;
  const lastKey = shiftMonth(month, -1);

  const thisMonth = totalsFor(txns, month);
  const lastMonth = totalsFor(txns, lastKey);

  const trend = months.map((m) => {
    const tt = totalsFor(txns, m);
    return { month: m, in: tt.in, out: tt.out, profit: tt.profit };
  });

  // category share this month + change vs last
  const thisCat = new Map<string, number>();
  const lastCat = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== 'out') continue;
    const m = mk(t);
    const c = t.category ?? 'other';
    if (m === month) thisCat.set(c, (thisCat.get(c) ?? 0) + t.amount);
    else if (m === lastKey) lastCat.set(c, (lastCat.get(c) ?? 0) + t.amount);
  }
  const categories = [...thisCat.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      share: thisMonth.out ? amount / thisMonth.out : 0,
      deltaPct: deltaPct(amount, lastCat.get(category) ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  // top vendors this month
  const byVendor = new Map<string, { vendor: string; amount: number; count: number }>();
  for (const t of txns) {
    if (t.direction !== 'out' || mk(t) !== month) continue;
    const v = normVendor(t.vendor);
    const label = t.vendor?.trim() || '—';
    const key = v || '—';
    const g = byVendor.get(key) ?? { vendor: label, amount: 0, count: 0 };
    g.amount += t.amount;
    g.count += 1;
    byVendor.set(key, g);
  }
  const topVendors = [...byVendor.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);

  const recurring = detectRecurring(txns, months, opts.recurringOverrides ?? {});
  const unusual = detectUnusual(txns, month);
  const txnCount = txns.filter((t) => mk(t) === month).length;

  return {
    txnCount,
    thisMonth,
    lastMonth,
    delta: {
      in: deltaPct(thisMonth.in, lastMonth.in),
      out: deltaPct(thisMonth.out, lastMonth.out),
      profit: deltaPct(thisMonth.profit, lastMonth.profit),
    },
    trend,
    categories,
    topVendors,
    recurring,
    unusual,
  };
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String(((total % 12) + 12) % 12 + 1).padStart(2, '0')}`;
}
