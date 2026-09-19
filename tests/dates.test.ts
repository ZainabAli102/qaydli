/* eslint-disable no-console */
// Unit tests for the month-range helpers (run: npm run test:dates).
import assert from 'node:assert/strict';
import { monthRange, monthOf, currentMonth, todayISO, isMonth } from '../lib/dates';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('month helpers');

check('monthRange mid-year: July 2026', () => {
  const r = monthRange('2026-07');
  assert.equal(r.start, '2026-07-01');
  assert.equal(r.nextStart, '2026-08-01');
  assert.equal(r.prev, '2026-06');
  assert.equal(r.next, '2026-08');
});

check('a 2026-07-27 date falls inside July 2026', () => {
  const r = monthRange('2026-07');
  const d = '2026-07-27';
  assert.ok(r.start <= d && d < r.nextStart, 'mid-month date must be in range');
});

check('first and last day of the month are both in range', () => {
  const r = monthRange('2026-07');
  const first = '2026-07-01';
  const last = '2026-07-31';
  assert.ok(r.start <= first && first < r.nextStart, 'first day in range');
  assert.ok(r.start <= last && last < r.nextStart, 'last day in range');
  // The day before and the first of next month are OUT of range.
  assert.ok(!('2026-06-30' >= r.start && '2026-06-30' < r.nextStart), 'prev-month last day out');
  assert.ok(!('2026-08-01' >= r.start && '2026-08-01' < r.nextStart), 'next-month first day out');
});

check('year boundary: December rolls into next January', () => {
  const r = monthRange('2026-12');
  assert.equal(r.start, '2026-12-01');
  assert.equal(r.nextStart, '2027-01-01');
  assert.equal(r.next, '2027-01');
  assert.equal(r.prev, '2026-11');
  assert.ok(r.start <= '2026-12-31' && '2026-12-31' < r.nextStart, 'Dec 31 in range');
});

check('year boundary: January rolls back to previous December', () => {
  const r = monthRange('2026-01');
  assert.equal(r.prev, '2025-12');
  assert.equal(r.nextStart, '2026-02-01');
});

check('monthOf reads a date, falls back to current month', () => {
  assert.equal(monthOf('2026-07-27'), '2026-07');
  const now = new Date('2026-09-19T09:00:00Z');
  assert.equal(monthOf('', 'Asia/Baghdad', now), currentMonth('Asia/Baghdad', now));
});

check('current month uses Asia/Baghdad, not UTC (near-midnight boundary)', () => {
  // 2026-07-31 22:00 UTC is 2026-08-01 01:00 in Baghdad (UTC+3).
  const nearMidnight = new Date('2026-07-31T22:00:00Z');
  assert.equal(todayISO('Asia/Baghdad', nearMidnight), '2026-08-01');
  assert.equal(currentMonth('Asia/Baghdad', nearMidnight), '2026-08');
  // Same instant is still July in UTC.
  assert.equal(todayISO('UTC', nearMidnight), '2026-07-31');
});

check('isMonth validates YYYY-MM', () => {
  assert.ok(isMonth('2026-07'));
  assert.ok(!isMonth('2026-7'));
  assert.ok(!isMonth('all'));
  assert.ok(!isMonth(undefined));
});

console.log(`\n${passed} checks passed\n`);
