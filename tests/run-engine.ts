/* eslint-disable no-console */
// Engine test harness. Reads tests/receipts/expected.json, runs extract() on
// each image that exists in tests/receipts/ (RUNS times each), and prints a
// per-field accuracy AND stability table plus token/cost per receipt.
//
//   npm run test:engine
//   RUNS=3 OPENAI_MODEL=gpt-4o npm run test:engine
//
// Env: OPENAI_API_KEY (required), OPENAI_MODEL (default gpt-4o), RUNS (default
// 3), OPENAI_PRICE_IN/OPENAI_PRICE_OUT (USD per 1M tokens, for models not in
// the built-in PRICING table). With no key or no images it explains what to add
// and exits 0. Stability = share of receipts whose value was identical across
// all RUNS runs.

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

// A scored field: is a run correct, and what canonical value did it produce
// (so we can measure whether the value is stable across repeated runs).
type Check = { key: string; correct: (r: ReceiptResult) => boolean; canon: (r: ReceiptResult) => string };

function buildChecks(c: Case): Check[] {
  const checks: Check[] = [];
  for (const [key, exp] of Object.entries(c.expected)) {
    if (NON_SCORED.has(key)) continue;
    if (key === 'vendor' || key === 'vendor_latin') {
      checks.push({
        key,
        correct: (r) => matchVendor(exp, r),
        canon: (r) => normLoose(fieldValue(r, key)),
      });
    } else {
      checks.push({
        key,
        correct: (r) => compareField(key, exp, fieldValue(r, key)),
        canon: (r) => norm(fieldValue(r, key)),
      });
    }
  }
  if (typeof c.expected.line_items_count === 'number') {
    const want = c.expected.line_items_count;
    checks.push({
      key: 'line_items_count',
      correct: (r) => r.line_items.length === want,
      canon: (r) => String(r.line_items.length),
    });
  }
  if (c.expected.first_line_item) {
    for (const [k, v] of Object.entries(c.expected.first_line_item)) {
      checks.push({
        key: `first_item.${k}`,
        correct: (r) => {
          const got = r.line_items[0]
            ? (r.line_items[0] as unknown as Record<string, number | null>)[k]
            : null;
          return got !== null && got !== undefined && within1pct(Number(got), Number(v));
        },
        canon: (r) =>
          String(r.line_items[0]
            ? (r.line_items[0] as unknown as Record<string, number | null>)[k]
            : null),
      });
    }
  }
  if (Array.isArray(c.expected.flags)) {
    for (const code of c.expected.flags) {
      checks.push({
        key: `flag:${code}`,
        correct: (r) => r.flags.some((f) => f.code === code),
        canon: (r) => (r.flags.some((f) => f.code === code) ? 'yes' : 'no'),
      });
    }
  }
  return checks;
}

// USD per 1M tokens (developers.openai.com/api/docs/pricing, standard tier).
// Override with OPENAI_PRICE_IN / OPENAI_PRICE_OUT for models not listed here.
const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1': { in: 2.0, out: 8 },
  'gpt-5.5': { in: 5.0, out: 30 },
  'gpt-5.6-sol': { in: 4.0, out: 20 },
};

type Tally = { tested: number; correct: number; receipts: number; stable: number };

async function main() {
  loadEnvLocal();

  const raw = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8')) as { cases: Case[] };
  const cases = raw.cases;
  const present = cases.filter((c) => existsSync(join(DIR, c.image)));
  const imagesOnDisk = readdirSync(DIR).filter((f) => extname(f).toLowerCase() in MIME);

  const RUNS = Math.max(1, Number(process.env.RUNS ?? 3));
  const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
  const price =
    process.env.OPENAI_PRICE_IN && process.env.OPENAI_PRICE_OUT
      ? { in: Number(process.env.OPENAI_PRICE_IN), out: Number(process.env.OPENAI_PRICE_OUT) }
      : PRICING[MODEL];

  console.log(
    `\nQaydli engine test — model ${MODEL}, ${RUNS} run(s)/receipt, ` +
      `${present.length}/${cases.length} images present.`
  );
  if (imagesOnDisk.length === 0) {
    console.log(`\nNo images found in ${DIR}. Add the receipt photos and re-run.\n`);
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.log('\nOPENAI_API_KEY is not set (add it to .env.local). Cannot call the model.\n');
    return;
  }

  const perField = new Map<string, Tally>();
  const bump = (key: string, correctCount: number, runs: number, stable: boolean) => {
    const t = perField.get(key) ?? { tested: 0, correct: 0, receipts: 0, stable: 0 };
    t.tested += runs;
    t.correct += correctCount;
    t.receipts += 1;
    if (stable) t.stable += 1;
    perField.set(key, t);
  };

  let sumIn = 0;
  let sumOut = 0;
  let calls = 0;

  for (const c of present) {
    const bytes = readFileSync(join(DIR, c.image));
    const base64 = bytes.toString('base64');
    const mimeType = MIME[extname(c.image).toLowerCase()] ?? 'image/jpeg';
    const checks = buildChecks(c);

    process.stdout.write(`\n• ${c.image} … `);
    const runs: ReceiptResult[] = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        const r = await extract(base64, {
          provider: 'openai',
          model: MODEL,
          mimeType,
          captureUsage: (u) => {
            sumIn += u.prompt_tokens;
            sumOut += u.completion_tokens;
            calls += 1;
          },
        });
        runs.push(r);
      } catch (err) {
        process.stdout.write(`ERROR: ${err instanceof Error ? err.message : String(err)} `);
      }
    }
    if (runs.length === 0) {
      console.log('(no successful runs)');
      continue;
    }

    // Per-check: accuracy over all runs, and stability (identical value across runs).
    const perRunCorrect = new Array(runs.length).fill(0);
    for (const chk of checks) {
      let correctCount = 0;
      runs.forEach((r, i) => {
        if (chk.correct(r)) {
          correctCount += 1;
          perRunCorrect[i] += 1;
        }
      });
      const canons = runs.map((r) => chk.canon(r));
      const stable = canons.every((v) => v === canons[0]);
      bump(chk.key, correctCount, runs.length, stable);
    }
    console.log(
      `runs ${perRunCorrect.map((n) => `${n}/${checks.length}`).join(' ')}`
    );
  }

  // ---- accuracy + stability table -----------------------------------------
  const W = 62;
  console.log(`\nPer-field accuracy & stability (${MODEL}, ${RUNS} runs)`);
  console.log('─'.repeat(W));
  console.log(
    `${'field'.padEnd(24)}${'correct'.padStart(9)}${'acc'.padStart(7)}   ${'stable'.padStart(13)}`
  );
  console.log('─'.repeat(W));
  let totTested = 0;
  let totCorrect = 0;
  let totReceipts = 0;
  let totStable = 0;
  for (const [key, t] of [...perField.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    totTested += t.tested;
    totCorrect += t.correct;
    totReceipts += t.receipts;
    totStable += t.stable;
    const acc = t.tested ? ((100 * t.correct) / t.tested).toFixed(0) : '0';
    const stab = t.receipts ? ((100 * t.stable) / t.receipts).toFixed(0) : '0';
    const stabStr = RUNS > 1 ? `${t.stable}/${t.receipts} (${stab}%)` : 'n/a';
    console.log(
      `${key.padEnd(24)}${`${t.correct}/${t.tested}`.padStart(9)}${`${acc}%`.padStart(7)}   ${stabStr.padStart(13)}`
    );
  }
  console.log('─'.repeat(W));
  const overall = totTested ? ((100 * totCorrect) / totTested).toFixed(1) : '0';
  const stabOverall = totReceipts ? ((100 * totStable) / totReceipts).toFixed(1) : '0';
  const stabOverallStr = RUNS > 1 ? `${stabOverall}%` : 'n/a';
  console.log(
    `${'OVERALL'.padEnd(24)}${`${totCorrect}/${totTested}`.padStart(9)}${`${overall}%`.padStart(7)}   ${stabOverallStr.padStart(13)}`
  );

  // ---- cost ----------------------------------------------------------------
  if (calls > 0) {
    const avgIn = sumIn / calls;
    const avgOut = sumOut / calls;
    console.log(`\nTokens/receipt (avg): in ${avgIn.toFixed(0)}, out ${avgOut.toFixed(0)}`);
    if (price) {
      const costPerReceipt = (avgIn * price.in + avgOut * price.out) / 1e6;
      console.log(
        `Cost/receipt (avg):   $${costPerReceipt.toFixed(5)}  ` +
          `(@ $${price.in}/$${price.out} per 1M in/out)`
      );
    } else {
      console.log(`Cost/receipt: no pricing for ${MODEL} (set OPENAI_PRICE_IN / OPENAI_PRICE_OUT).`);
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
