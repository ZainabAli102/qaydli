/* eslint-disable no-console */
// Unit tests for invoice status derivation, numbering, totals, and stats
// (run: npm run test:invoices).
import assert from 'node:assert/strict';
import {
  formatInvoiceNumber,
  computeTotals,
  lineTotal,
  dueDateFrom,
  deriveStatus,
  isOverdue,
  displayStatus,
  daysBetween,
  matchesTab,
  invoiceStats,
} from '../lib/invoices';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('invoices');

// ---- numbering -------------------------------------------------------------
check('formatInvoiceNumber pads to 3 digits, per-business', () => {
  assert.equal(formatInvoiceNumber(1), 'INV-001');
  assert.equal(formatInvoiceNumber(42), 'INV-042');
  assert.equal(formatInvoiceNumber(100), 'INV-100');
  assert.equal(formatInvoiceNumber(2026), 'INV-2026'); // grows past 999
});

check('formatInvoiceNumber is monotonic and unique for a rising sequence', () => {
  const seen = new Set<string>();
  let prevSeq = 0;
  for (let s = 1; s <= 250; s++) {
    // a race-safe RPC hands out strictly increasing seq; the format must be 1:1
    assert.ok(s > prevSeq, 'seq strictly increasing');
    const n = formatInvoiceNumber(s);
    assert.ok(!seen.has(n), `number ${n} must be unique`);
    seen.add(n);
    prevSeq = s;
  }
  assert.equal(seen.size, 250);
});

// ---- totals ----------------------------------------------------------------
check('computeTotals sums line items and applies discount', () => {
  const items = [
    { qty: 3, unit_price: 250_000 },
    { qty: 1, unit_price: 50_000 },
  ];
  const t = computeTotals(items, 100_000);
  assert.equal(t.subtotal, 800_000);
  assert.equal(t.discount, 100_000);
  assert.equal(t.total, 700_000);
});

check('computeTotals clamps a discount larger than the subtotal', () => {
  const t = computeTotals([{ qty: 1, unit_price: 100 }], 999);
  assert.equal(t.subtotal, 100);
  assert.equal(t.discount, 100);
  assert.equal(t.total, 0);
});

check('lineTotal guards non-finite input', () => {
  assert.equal(lineTotal({ qty: 2, unit_price: 3 }), 6);
  assert.equal(lineTotal({ qty: NaN, unit_price: 3 }), 0);
});

check('dueDateFrom adds days across a month boundary', () => {
  assert.equal(dueDateFrom('2026-01-25', 14), '2026-02-08');
  assert.equal(dueDateFrom('2026-09-19', 7), '2026-09-26');
  assert.equal(dueDateFrom('2026-12-30', 30), '2027-01-29');
});

// ---- status derivation -----------------------------------------------------
check('deriveStatus: unpaid draft vs sent', () => {
  assert.equal(deriveStatus({ total: 1000, paid: 0, sent: false }), 'draft');
  assert.equal(deriveStatus({ total: 1000, paid: 0, sent: true }), 'sent');
});

check('deriveStatus: partial when 0 < paid < total', () => {
  assert.equal(deriveStatus({ total: 1000, paid: 1, sent: true }), 'partial');
  assert.equal(deriveStatus({ total: 1000, paid: 999, sent: true }), 'partial');
});

check('deriveStatus: paid when paid >= total (and total > 0)', () => {
  assert.equal(deriveStatus({ total: 1000, paid: 1000, sent: true }), 'paid');
  assert.equal(deriveStatus({ total: 1000, paid: 1200, sent: false }), 'paid');
  // total 0 is never "paid" via a zero payment
  assert.equal(deriveStatus({ total: 0, paid: 0, sent: true }), 'sent');
});

check('isOverdue only for unpaid sent/partial past the due date', () => {
  assert.ok(isOverdue({ status: 'sent', dueDate: '2026-09-01', today: '2026-09-19' }));
  assert.ok(isOverdue({ status: 'partial', dueDate: '2026-09-18', today: '2026-09-19' }));
  // not past due
  assert.ok(!isOverdue({ status: 'sent', dueDate: '2026-09-19', today: '2026-09-19' }));
  assert.ok(!isOverdue({ status: 'sent', dueDate: '2026-10-01', today: '2026-09-19' }));
  // paid / draft never overdue; no due date never overdue
  assert.ok(!isOverdue({ status: 'paid', dueDate: '2026-01-01', today: '2026-09-19' }));
  assert.ok(!isOverdue({ status: 'draft', dueDate: '2026-01-01', today: '2026-09-19' }));
  assert.ok(!isOverdue({ status: 'sent', dueDate: null, today: '2026-09-19' }));
});

check('displayStatus layers overdue onto sent/partial', () => {
  assert.equal(displayStatus({ status: 'sent', dueDate: '2026-09-01', today: '2026-09-19' }), 'overdue');
  assert.equal(displayStatus({ status: 'partial', dueDate: '2026-10-01', today: '2026-09-19' }), 'partial');
  assert.equal(displayStatus({ status: 'paid', dueDate: '2026-01-01', today: '2026-09-19' }), 'paid');
});

check('matchesTab routes each display status to the right tab', () => {
  assert.ok(matchesTab('all', 'draft'));
  assert.ok(matchesTab('due', 'sent'));
  assert.ok(matchesTab('due', 'partial'));
  assert.ok(matchesTab('due', 'overdue'));
  assert.ok(!matchesTab('due', 'paid'));
  assert.ok(!matchesTab('due', 'draft'));
  assert.ok(matchesTab('overdue', 'overdue'));
  assert.ok(!matchesTab('overdue', 'sent'));
  assert.ok(matchesTab('paid', 'paid'));
});

// ---- stats -----------------------------------------------------------------
check('daysBetween counts whole days', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-19'), 18);
  assert.equal(daysBetween('2026-09-19', '2026-09-19'), 0);
});

check('invoiceStats: owed, overdue, and average days to get paid', () => {
  const today = '2026-09-19';
  const rows = [
    // fully paid in 10 days — counts toward avg only
    { total: 1_000_000, paid: 1_000_000, status: 'paid' as const, dueDate: '2026-09-10', issueDate: '2026-09-01', paidOnDate: '2026-09-11' },
    // sent, not yet due — owed but not overdue
    { total: 500_000, paid: 0, status: 'sent' as const, dueDate: '2026-10-01', issueDate: '2026-09-15', paidOnDate: null },
    // partial, past due — owed + overdue on the outstanding portion
    { total: 800_000, paid: 300_000, status: 'partial' as const, dueDate: '2026-09-05', issueDate: '2026-08-20', paidOnDate: null },
    // another paid in 20 days
    { total: 200_000, paid: 200_000, status: 'paid' as const, dueDate: '2026-09-01', issueDate: '2026-08-10', paidOnDate: '2026-08-30' },
  ];
  const s = invoiceStats(rows, today);
  assert.equal(s.owed, 500_000 + 500_000); // 500k sent + 500k outstanding on partial
  assert.equal(s.overdue, 500_000); // only the past-due partial's outstanding
  assert.equal(s.avgDaysToPay, 15); // (10 + 20) / 2
});

check('invoiceStats: avgDaysToPay is null when nothing has been paid', () => {
  const s = invoiceStats(
    [{ total: 100, paid: 0, status: 'sent', dueDate: null, issueDate: '2026-09-01', paidOnDate: null }],
    '2026-09-19'
  );
  assert.equal(s.avgDaysToPay, null);
  assert.equal(s.owed, 100);
  assert.equal(s.overdue, 0);
});

console.log(`\n${passed} checks passed\n`);
