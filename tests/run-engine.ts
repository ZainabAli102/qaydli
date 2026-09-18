/* eslint-disable no-console */
// Engine test harness. Reads tests/receipts/expected.json, runs extract() on
// each image that exists in tests/receipts/, and prints a per-field accuracy
// table. Images are added locally by the owner; missing ones are skipped.
//
//   npm run test:engine
//
// Requires OPENAI_API_KEY (from .env.local or the environment) to call the
// vision model. With no key or no images, it explains what to add and exits 0.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { extract } from '../lib/engine';
import type { ReceiptResult } from '../lib/engine/types';

const DIR = join(process.cwd(), 'tests', 'receipts');
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

type Expected = Record<string, unknown> & {
  line_items_count?: number;
  first_line_item?: { qty?: number; unit_price?: number; line_total?: number };
  flags?: string[];
};
type Case = { image: string; human?: string; expected: Expected };

// Fields compared as numbers (within 1%); everything else compared as strings.
const NUMERIC = new Set(['subtotal', 'discount', 'total', 'paid_amount', 'remaining']);
const NON_SCORED = new Set(['line_items_count', 'first_line_item', 'flags']);

// ---- tiny .env.local loader (no dependency) --------------------------------
function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function within1pct(a: number, b: number): boolean {
  if (b === 0) return Math.abs(a) < 1e-9;
  return Math.abs(a - b) <= 0.01 * Math.abs(b);
}

// Read a scalar field's value out of a ReceiptResult ({value,confidence}).
function fieldValue(result: ReceiptResult, key: string): unknown {
  const f = (result as unknown as Record<string, { value: unknown } | undefined>)[key];
  return f && typeof f === 'object' && 'value' in f ? f.value : undefined;
}

function compareField(key: string, expected: unknown, got: unknown): boolean {
  if (Array.isArray(expected)) {
    // e.g. an ambiguous date: pass if any listed value matches.
    return expected.some((e) => compareField(key, e, got));
  }
  if (NUMERIC.has(key)) {
    const e = Number(expected);
    const g = Number(got);
    return Number.isFinite(e) && Number.isFinite(g) && within1pct(g, e);
  }
  if (key === 'invoice_number') {
    return norm(expected).replace(/\s/g, '') === norm(got).replace(/\s/g, '');
  }
  // document_type, currency, paid_currency, language, date, ...
  return norm(expected) === norm(got);
}

// Vendor matching is script-agnostic: a business may be read in Arabic/Kurdish
// (vendor) or transliterated (vendor_latin), so the expected brand passes if it
// matches EITHER field, ignoring spaces and punctuation.
function normLoose(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s._\-]/g, '');
}
function matchVendor(expected: unknown, result: ReceiptResult): boolean {
  const e = normLoose(expected);
  if (!e) return false;
  return [fieldValue(result, 'vendor'), fieldValue(result, 'vendor_latin')]
    .map(normLoose)
    .some((c) => c !== '' && (c.includes(e) || e.includes(c)));
}

type Tally = { tested: number; correct: number };

async function main() {
  loadEnvLocal();

  const raw = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8')) as { cases: Case[] };
  const cases = raw.cases;

  const present = cases.filter((c) => existsSync(join(DIR, c.image)));
  const imagesOnDisk = readdirSync(DIR).filter((f) => extname(f).toLowerCase() in MIME);

  console.log(`\nQaydli engine test — ${cases.length} cases, ${present.length} image(s) present.`);
  if (imagesOnDisk.length === 0) {
    console.log(
      `\nNo images found in ${DIR}. Add the receipt photos (taj.jpg, pharmacy.jpg, ` +
        `bellona.jpg, homecenter.jpg, adham.jpg, mvk.jpg) and re-run.\n`
    );
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log('\nOPENAI_API_KEY is not set (add it to .env.local). Cannot call the model.\n');
    return;
  }

  const perField = new Map<string, Tally>();
  const bump = (key: string, correct: boolean) => {
    const t = perField.get(key) ?? { tested: 0, correct: 0 };
    t.tested += 1;
    if (correct) t.correct += 1;
    perField.set(key, t);
  };

  for (const c of present) {
    const bytes = readFileSync(join(DIR, c.image));
    const base64 = bytes.toString('base64');
    const mimeType = MIME[extname(c.image).toLowerCase()] ?? 'image/jpeg';

    process.stdout.write(`\n• ${c.image} … `);
    let result: ReceiptResult;
    try {
      result = await extract(base64, { provider: 'openai', mimeType });
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let caseCorrect = 0;
    let caseTested = 0;

    for (const [key, exp] of Object.entries(c.expected)) {
      if (NON_SCORED.has(key)) continue;
      const ok =
        key === 'vendor' || key === 'vendor_latin'
          ? matchVendor(exp, result)
          : compareField(key, exp, fieldValue(result, key));
      bump(key, ok);
      caseTested += 1;
      if (ok) caseCorrect += 1;
    }

    // line_items_count
    if (typeof c.expected.line_items_count === 'number') {
      const ok = result.line_items.length === c.expected.line_items_count;
      bump('line_items_count', ok);
      caseTested += 1;
      if (ok) caseCorrect += 1;
    }
    // first_line_item (qty / unit_price / line_total)
    if (c.expected.first_line_item) {
      const first = result.line_items[0];
      for (const [k, v] of Object.entries(c.expected.first_line_item)) {
        const got = first ? (first as unknown as Record<string, number | null>)[k] : null;
        const ok = got !== null && got !== undefined && within1pct(Number(got), Number(v));
        bump(`first_item.${k}`, ok);
        caseTested += 1;
        if (ok) caseCorrect += 1;
      }
    }
    // flags: each expected code must be present
    if (Array.isArray(c.expected.flags)) {
      for (const code of c.expected.flags) {
        const ok = result.flags.some((f) => f.code === code);
        bump(`flag:${code}`, ok);
        caseTested += 1;
        if (ok) caseCorrect += 1;
      }
    }

    console.log(`${caseCorrect}/${caseTested} fields`);
  }

  // ---- accuracy table ------------------------------------------------------
  console.log('\nPer-field accuracy');
  console.log('─'.repeat(46));
  console.log(`${'field'.padEnd(26)}${'correct'.padStart(9)}${'acc'.padStart(11)}`);
  console.log('─'.repeat(46));
  let totTested = 0;
  let totCorrect = 0;
  for (const [key, t] of [...perField.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    totTested += t.tested;
    totCorrect += t.correct;
    const acc = t.tested ? ((100 * t.correct) / t.tested).toFixed(0) : '0';
    console.log(`${key.padEnd(26)}${`${t.correct}/${t.tested}`.padStart(9)}${`${acc}%`.padStart(11)}`);
  }
  console.log('─'.repeat(46));
  const overall = totTested ? ((100 * totCorrect) / totTested).toFixed(1) : '0';
  console.log(`${'OVERALL'.padEnd(26)}${`${totCorrect}/${totTested}`.padStart(9)}${`${overall}%`.padStart(11)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
