/* eslint-disable no-console */
// Unit tests for save-time total validation (run: npm run test:validation).
import assert from 'node:assert/strict';
import { validateTotal } from '../lib/validation';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('total validation');

check('positive totals pass', () => {
  assert.equal(validateTotal(1).ok, true);
  assert.equal(validateTotal(250000).ok, true);
  assert.equal(validateTotal(0.5).ok, true);
});

check('zero is blocked by default', () => {
  const v = validateTotal(0);
  assert.equal(v.ok, false);
  assert.equal(v.code, 'total_zero');
});

check('empty / non-finite is blocked', () => {
  assert.equal(validateTotal(null).ok, false);
  assert.equal(validateTotal(undefined).ok, false);
  assert.equal(validateTotal(NaN).ok, false);
  assert.equal(validateTotal(Number('')).ok, false); // Number('') === 0, still blocked
});

check('negative is blocked, even with allowZero', () => {
  assert.equal(validateTotal(-1).ok, false);
  assert.equal(validateTotal(-0.01).ok, false);
  assert.equal(validateTotal(-100, { allowZero: true }).ok, false);
});

check('allowZero permits exactly zero (credit note / fully discounted)', () => {
  const v = validateTotal(0, { allowZero: true });
  assert.equal(v.ok, true);
  assert.equal(v.code, undefined);
});

check('allowZero still blocks empty', () => {
  assert.equal(validateTotal(null, { allowZero: true }).ok, false);
  assert.equal(validateTotal(NaN, { allowZero: true }).ok, false);
});

check('allowZero:false keeps positive passing', () => {
  assert.equal(validateTotal(10, { allowZero: false }).ok, true);
});

console.log(`\n${passed} checks passed\n`);
