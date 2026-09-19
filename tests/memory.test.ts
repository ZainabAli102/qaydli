/* eslint-disable no-console */
// Unit tests for per-business memory matching (run: npm run test:memory).
import assert from 'node:assert/strict';
import {
  normalizePhrase,
  similarity,
  bestClientMatch,
  matchItemPhrase,
  lookupCategoryVocab,
} from '../lib/memory';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('memory matching');

check('normalizePhrase: case, punctuation, whitespace, Arabic-Indic digits', () => {
  assert.equal(normalizePhrase('  Training  Day! '), 'training day');
  assert.equal(normalizePhrase('Hawler-School, Ltd.'), 'hawler school ltd');
  assert.equal(normalizePhrase('٢٥٬٠٠٠ دينار'), '25 000 دينار');
});

check('normalizePhrase: Arabic letter folding (alef/ة/ى)', () => {
  assert.equal(normalizePhrase('أحمد'), normalizePhrase('احمد'));
  assert.equal(normalizePhrase('مدرسة'), normalizePhrase('مدرسه'));
});

check('similarity is 1 for identical, lower for edits', () => {
  assert.equal(similarity('hawler', 'hawler'), 1);
  assert.ok(similarity('hawler', 'hawlar') > 0.8);
  assert.ok(similarity('abc', 'xyz') < 0.4);
});

const clients = [
  { id: 'c1', name: 'Hawler International School' },
  { id: 'c2', name: 'Zagros Trading' },
  { id: 'c3', name: 'مدرسة بغداد الأهلية' },
];

check('bestClientMatch: saved alias wins (exact, normalized)', () => {
  const aliases = [{ alias_norm: normalizePhrase('hawler skool'), client_id: 'c1' }];
  assert.equal(bestClientMatch('Hawler Skool', clients, aliases), 'c1');
});

check('bestClientMatch: exact normalized name', () => {
  assert.equal(bestClientMatch('zagros trading', clients), 'c2');
});

check('bestClientMatch: token-subset (short spoken name)', () => {
  assert.equal(bestClientMatch('Hawler', clients), 'c1');
});

check('bestClientMatch: fuzzy typo within threshold', () => {
  assert.equal(bestClientMatch('Zagros Tradng', clients), 'c2');
});

check('bestClientMatch: Arabic client via folding', () => {
  assert.equal(bestClientMatch('مدرسه بغداد الاهليه', clients), 'c3');
});

check('bestClientMatch: no confident match → null', () => {
  assert.equal(bestClientMatch('Totally Different Co', clients), null);
  assert.equal(bestClientMatch('', clients), null);
});

const phrases = [
  { phrase_norm: normalizePhrase('training day'), description: 'Training day', unit_price: 250000 },
  { phrase_norm: normalizePhrase('consulting hour'), description: 'Consulting hour', unit_price: 40000 },
];

check('matchItemPhrase: exact and fuzzy → remembered price', () => {
  assert.equal(matchItemPhrase('Training Day', phrases)?.unit_price, 250000);
  assert.equal(matchItemPhrase('training days', phrases)?.unit_price, 250000);
  assert.equal(matchItemPhrase('unrelated thing', phrases), null);
});

const vocab = [
  { phrase_norm: normalizePhrase('mvk electric'), category: 'utilities', uses: 5 },
  { phrase_norm: normalizePhrase('electric'), category: 'utilities', uses: 2 },
  { phrase_norm: normalizePhrase('بنزين'), category: 'fuel', uses: 3 },
];

check('lookupCategoryVocab: exact, contained, and most-used wins', () => {
  assert.equal(lookupCategoryVocab('MVK Electric', vocab), 'utilities');
  assert.equal(lookupCategoryVocab('paid the electric bill', vocab), 'utilities');
  assert.equal(lookupCategoryVocab('محطة بنزين النور', vocab), 'fuel');
  assert.equal(lookupCategoryVocab('something new', vocab), null);
});

console.log(`\n${passed} checks passed\n`);
