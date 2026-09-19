/* eslint-disable no-console */
// Unit tests for learning-loop accuracy analytics (run: npm run test:accuracy).
import assert from 'node:assert/strict';
import {
  correctedEntryCount,
  isoWeekKey,
  weeklyAccuracy,
  topCorrectionPatterns,
  type CorrectionRow,
} from '../lib/accuracy';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('accuracy analytics');

const corr = (field: string, ai: string, final: string, created_at: string): CorrectionRow => ({
  field,
  ai_value: ai,
  final_value: final,
  created_at,
});

check('correctedEntryCount: distinct saves (same timestamp = one entry)', () => {
  const rows = [
    corr('vendor', 'a', 'b', '2026-09-01T10:00:00.000Z'),
    corr('total', '1', '2', '2026-09-01T10:00:00.000Z'), // same save → same entry
    corr('vendor', 'c', 'd', '2026-09-02T08:30:15.500Z'),
  ];
  assert.equal(correctedEntryCount(rows), 2);
  assert.equal(correctedEntryCount([]), 0);
});

check('isoWeekKey: ISO-8601 week, Monday start', () => {
  // 2026-01-01 is a Thursday → ISO week 1 of 2026.
  assert.equal(isoWeekKey('2026-01-01'), '2026-W01');
  // 2025-12-29 (Mon) belongs to 2026-W01 as well.
  assert.equal(isoWeekKey('2025-12-29'), '2026-W01');
  assert.equal(isoWeekKey('2026-09-19'), isoWeekKey('2026-09-14')); // same Mon-Sun week
});

check('weeklyAccuracy: entries + fields corrected per ISO week, sorted', () => {
  const entries = [
    { created_at: '2026-09-07T09:00:00Z' }, // W37
    { created_at: '2026-09-08T09:00:00Z' }, // W37
    { created_at: '2026-09-14T09:00:00Z' }, // W38
  ];
  const corrections = [
    corr('vendor', 'a', 'b', '2026-09-07T09:00:00Z'), // W37
    corr('total', '1', '2', '2026-09-14T09:00:00Z'), // W38
    corr('date', 'x', 'y', '2026-09-15T09:00:00Z'), // W38
  ];
  const weeks = weeklyAccuracy(entries, corrections);
  assert.equal(weeks.length, 2);
  assert.deepEqual(weeks.map((w) => w.week), ['2026-W37', '2026-W38']);
  assert.equal(weeks[0].entries, 2);
  assert.equal(weeks[0].fieldsCorrected, 1);
  assert.equal(weeks[0].perEntry, 0.5);
  assert.equal(weeks[1].entries, 1);
  assert.equal(weeks[1].fieldsCorrected, 2);
  assert.equal(weeks[1].perEntry, 2);
});

check('topCorrectionPatterns: most frequent first, deterministic ties', () => {
  const rows = [
    corr('category', 'other', 'fuel', 't1'),
    corr('category', 'other', 'fuel', 't2'),
    corr('category', 'other', 'fuel', 't3'),
    corr('vendor', 'mvk', 'MVK Electric', 't4'),
    corr('vendor', 'mvk', 'MVK Electric', 't5'),
    corr('currency', 'USD', 'IQD', 't6'),
  ];
  const top = topCorrectionPatterns(rows, 2);
  assert.equal(top.length, 2);
  assert.deepEqual(top[0], { field: 'category', ai_value: 'other', final_value: 'fuel', count: 3 });
  assert.deepEqual(top[1], { field: 'vendor', ai_value: 'mvk', final_value: 'MVK Electric', count: 2 });
});

check('topCorrectionPatterns: null values fold to empty string', () => {
  const rows = [
    corr('notes', '', 'hello', 't1'),
    { field: 'notes', ai_value: null, final_value: 'hello', created_at: 't2' },
  ];
  const top = topCorrectionPatterns(rows as CorrectionRow[]);
  assert.equal(top.length, 1);
  assert.equal(top[0].count, 2);
});

console.log(`\n${passed} checks passed\n`);
