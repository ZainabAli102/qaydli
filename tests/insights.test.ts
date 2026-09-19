/* eslint-disable no-console */
// Unit tests for recurring detection and the unusual-item rule.
// Run: npm run test:insights
import assert from 'node:assert/strict';
import { detectRecurring, detectUnusual, median, type TxnLike } from '../lib/insights';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

let seq = 0;
function tx(month: string, amount: number, vendor: string | null, category: string | null, direction: 'in' | 'out' = 'out'): TxnLike {
  seq += 1;
  return { id: `t${seq}`, vendor, category, direction, amount, occurred_on: `${month}-15` };
}

const MONTHS6 = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

console.log('recurring detection');

check('stable monthly vendor over 3+ months is recurring; fixedTotal = median', () => {
  const txns = [
    tx('2026-07', 500_000, 'Landlord', 'rent'),
    tx('2026-08', 500_000, 'Landlord', 'rent'),
    tx('2026-09', 500_000, 'Landlord', 'rent'),
  ];
  const r = detectRecurring(txns, MONTHS6);
  const g = r.groups.find((x) => x.label === 'Landlord')!;
  assert.equal(g.auto, true);
  assert.equal(g.recurring, true);
  assert.equal(g.monthlyAmount, 500_000);
  assert.equal(r.fixedTotal, 500_000);
});

check('utilities that vary within tolerance still count as recurring', () => {
  const txns = [
    tx('2026-07', 100_000, 'Power Co', 'utilities'),
    tx('2026-08', 130_000, 'Power Co', 'utilities'),
    tx('2026-09', 90_000, 'Power Co', 'utilities'),
  ];
  const r = detectRecurring(txns, MONTHS6);
  assert.equal(r.groups.find((x) => x.label === 'Power Co')!.auto, true);
});

check('only two months present → not auto-recurring', () => {
  const txns = [tx('2026-08', 500_000, 'Landlord', 'rent'), tx('2026-09', 500_000, 'Landlord', 'rent')];
  const r = detectRecurring(txns, MONTHS6);
  const g = r.groups.find((x) => x.label === 'Landlord');
  assert.equal(g?.auto ?? false, false);
});

check('wildly varying amounts across months → not recurring', () => {
  const txns = [
    tx('2026-07', 50_000, 'Supplier X', 'supplies'),
    tx('2026-08', 900_000, 'Supplier X', 'supplies'),
    tx('2026-09', 20_000, 'Supplier X', 'supplies'),
  ];
  const r = detectRecurring(txns, MONTHS6);
  assert.equal(r.groups.find((x) => x.label === 'Supplier X')!.auto, false);
});

check('owner override forces a group on / off', () => {
  const on = [tx('2026-08', 300_000, 'Gym', 'other'), tx('2026-09', 300_000, 'Gym', 'other')];
  // 2 months → not auto; override ON includes it in fixedTotal.
  const forcedOn = detectRecurring(on, MONTHS6, { 'v:gym': true });
  assert.equal(forcedOn.fixedTotal, 300_000);
  assert.equal(forcedOn.groups.find((g) => g.label === 'Gym')!.recurring, true);

  // A truly recurring group forced OFF is excluded from fixedTotal.
  const rentTxns = [
    tx('2026-07', 500_000, 'Landlord', 'rent'),
    tx('2026-08', 500_000, 'Landlord', 'rent'),
    tx('2026-09', 500_000, 'Landlord', 'rent'),
  ];
  const forcedOff = detectRecurring(rentTxns, MONTHS6, { 'v:landlord': false });
  assert.equal(forcedOff.fixedTotal, 0);
  assert.equal(forcedOff.groups.find((g) => g.label === 'Landlord')!.recurring, false);
});

check('income is ignored by recurring detection', () => {
  const txns = [
    tx('2026-07', 500_000, 'Client', 'other', 'in'),
    tx('2026-08', 500_000, 'Client', 'other', 'in'),
    tx('2026-09', 500_000, 'Client', 'other', 'in'),
  ];
  assert.equal(detectRecurring(txns, MONTHS6).fixedTotal, 0);
});

console.log('\nunusual items');

check('expense > 3x category 3-month median is flagged', () => {
  const txns = [
    tx('2026-07', 100_000, 'A', 'supplies'),
    tx('2026-08', 100_000, 'B', 'supplies'),
    tx('2026-09', 100_000, 'C', 'supplies'),
    tx('2026-09', 400_000, 'BigBuy', 'supplies'), // 4x median (100k)
  ];
  const u = detectUnusual(txns, '2026-09');
  const hit = u.find((x) => x.vendor === 'BigBuy');
  assert.ok(hit && hit.reason === 'high_for_category');
});

check('just under 3x (and a known vendor) is NOT flagged', () => {
  const txns = [
    tx('2026-07', 100_000, 'Mid', 'supplies'), // Mid seen before → not "new"
    tx('2026-08', 100_000, 'A', 'supplies'),
    tx('2026-09', 100_000, 'B', 'supplies'),
    tx('2026-09', 250_000, 'Mid', 'supplies'), // 2.5x median, known vendor
  ];
  const u = detectUnusual(txns, '2026-09');
  assert.equal(u.find((x) => x.vendor === 'Mid'), undefined);
});

check('new vendor with > 10% of month spend is flagged', () => {
  const txns = [
    tx('2026-07', 100_000, 'Regular', 'supplies'),
    tx('2026-08', 100_000, 'Regular', 'supplies'),
    tx('2026-09', 100_000, 'Regular', 'supplies'),
    tx('2026-09', 300_000, 'BrandNew', 'furniture'), // never seen; month spend 400k → 75%
  ];
  const u = detectUnusual(txns, '2026-09');
  const hit = u.find((x) => x.vendor === 'BrandNew');
  assert.ok(hit && hit.reason === 'new_big_vendor');
});

check('a previously-seen vendor is NOT flagged as new', () => {
  const txns = [
    tx('2026-08', 300_000, 'Known', 'furniture'),
    tx('2026-09', 300_000, 'Known', 'furniture'),
    tx('2026-09', 50_000, 'Known', 'supplies'),
  ];
  const u = detectUnusual(txns, '2026-09');
  assert.equal(u.find((x) => x.reason === 'new_big_vendor'), undefined);
});

check('small new vendor (< 10% of spend) is NOT flagged', () => {
  const txns = [
    tx('2026-09', 1_000_000, 'Big', 'rent'),
    tx('2026-09', 50_000, 'Tiny', 'supplies'), // 50k / 1.05m ≈ 4.7%
  ];
  const u = detectUnusual(txns, '2026-09');
  assert.equal(u.find((x) => x.vendor === 'Tiny'), undefined);
});

check('median helper: even and odd lengths', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

console.log(`\n${passed} checks passed\n`);
