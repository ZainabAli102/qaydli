/* eslint-disable no-console */
// Category resolution must NEVER be empty on the Review screen.
// Run: npm run test:category  (the six-receipt live check needs OPENAI_API_KEY
// and the images in tests/receipts; it skips cleanly otherwise).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { CATEGORIES, isCategory, resolveCategory } from '../lib/domain';

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  const r = fn();
  if (r instanceof Promise) return r.then(() => { passed += 1; console.log(`  ✓ ${name}`); });
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function loadEnvLocal() {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnvLocal();

  console.log('resolveCategory (pure) — always returns a valid, non-empty category');

  check('valid vendor memory wins and is "suggested"', () => {
    const r = resolveCategory({ memory: 'rent', model: 'utilities', text: 'x' });
    assert.equal(r.category, 'rent');
    assert.ok(r.suggested && r.fromMemory);
  });
  check('RETIRED memory slug (office_fitout) is ignored, not blank', () => {
    const r = resolveCategory({ memory: 'office_fitout', model: null, text: '' });
    assert.ok(isCategory(r.category)); // never empty / invalid
    assert.equal(r.category, 'other');
    assert.equal(r.fromMemory, false);
  });
  check('model suggestion used when memory absent, marked suggested', () => {
    const r = resolveCategory({ model: 'furniture', text: 'x' });
    assert.equal(r.category, 'furniture');
    assert.ok(r.suggested && !r.fromMemory);
  });
  check('label-form / misspelled model slug falls back (not blank)', () => {
    const r = resolveCategory({ model: 'Utilities', text: 'random shop' });
    assert.ok(isCategory(r.category));
    assert.equal(r.suggested, false); // keyword guess, not a chip
  });
  check('keyword guess from text (pharmacy → medical_personal)', () => {
    const r = resolveCategory({ model: null, text: 'Pharmacy One Al-Naseem' });
    assert.equal(r.category, 'medical_personal');
  });
  check('nothing at all → other, never empty', () => {
    const r = resolveCategory({});
    assert.equal(r.category, 'other');
    assert.ok(isCategory(r.category));
  });

  // ---- live six-receipt check ----------------------------------------------
  const DIR = join(process.cwd(), 'tests', 'receipts');
  const MIME: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  const cases = (JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8')).cases ?? []) as Array<{ image: string }>;
  const present = cases.filter((c) => existsSync(join(DIR, c.image)));

  if (!process.env.OPENAI_API_KEY || present.length === 0) {
    console.log('\n(skipping live six-receipt check — set OPENAI_API_KEY and add images to run it)');
  } else {
    console.log('\nsix sample receipts — every scan resolves to a non-empty valid category');
    const { extract } = await import('../lib/engine');
    for (const c of present) {
      await check(`${c.image}: category non-empty & valid`, async () => {
        const bytes = readFileSync(join(DIR, c.image));
        const r = await extract(bytes.toString('base64'), {
          provider: 'openai',
          mimeType: MIME[extname(c.image).toLowerCase()] ?? 'image/jpeg',
        });
        const res = resolveCategory({
          model: r.category?.value,
          text: `${r.vendor.value ?? ''} ${r.notes.value ?? ''}`,
        });
        assert.ok(res.category && isCategory(res.category), `empty/invalid category for ${c.image}`);
        assert.ok((CATEGORIES as readonly string[]).includes(res.category));
        console.log(`      → ${res.category}${res.suggested ? ' (suggested)' : ''}`);
      });
    }
  }

  console.log(`\n${passed} checks passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
