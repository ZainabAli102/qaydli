/* eslint-disable no-console */
// Export anonymized AI-vs-final training pairs for future prompt examples and
// fine-tuning. Reads across all businesses with the service-role key and writes
// a local JSON file. NOTHING is uploaded anywhere — the file stays on the
// machine that runs this, and the receipt images stay in the private bucket.
//
//   npm run export:corrections -- [--out <file>] [--days <n>] [--stdout]
//
// Anonymization: every real business_id is replaced by a stable code (b001,
// b002, …). No owner names, emails, phones, or business names are read. The
// receipt storage_path is kept so a training pipeline can fetch the image from
// the bucket, but the business_id prefix is rewritten to the anonymized code.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// --- Load env from .env.local / .env (tsx does not do this automatically). ---
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(join(process.cwd(), '.env.local'));
loadEnvFile(join(process.cwd(), '.env'));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const toStdout = process.argv.includes('--stdout');
const days = Math.min(3650, Math.max(1, Number(arg('days')) || 365));
const outPath =
  arg('out') ?? join('exports', `corrections-${new Date().toISOString().slice(0, 10)}.json`);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const [corrRes, docRes] = await Promise.all([
    supabase
      .from('corrections')
      .select('business_id, source, field, ai_value, final_value, language, model_used, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(100000),
    supabase
      .from('documents')
      .select('business_id, storage_path, document_type, extraction, corrections, created_at')
      .not('corrections', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(100000),
  ]);

  if (corrRes.error) throw corrRes.error;
  if (docRes.error) throw docRes.error;

  // Stable anonymized business codes (sorted for determinism across runs).
  const realIds = new Set<string>();
  for (const r of corrRes.data ?? []) realIds.add(r.business_id as string);
  for (const d of docRes.data ?? []) realIds.add(d.business_id as string);
  const code = new Map<string, string>();
  [...realIds].sort().forEach((id, i) => code.set(id, `b${String(i + 1).padStart(3, '0')}`));
  const anon = (id: string) => code.get(id) ?? 'b000';
  // Re-key a "<business_id>/<file>" storage path onto the anonymized code.
  const anonPath = (path: string, businessId: string) =>
    path.startsWith(`${businessId}/`) ? `${anon(businessId)}/${path.slice(businessId.length + 1)}` : path;

  const fieldCorrections = (corrRes.data ?? []).map((r) => ({
    business: anon(r.business_id as string),
    source: r.source,
    field: r.field,
    ai_value: r.ai_value,
    final_value: r.final_value,
    language: r.language,
    model_used: r.model_used,
    created_at: r.created_at,
  }));

  // Document-level pairs: the raw extraction (AI) vs the owner's reviewed values
  // (final), each anchored to the receipt image path.
  const documentPairs = (docRes.data ?? []).map((d) => ({
    business: anon(d.business_id as string),
    image_path: anonPath(d.storage_path as string, d.business_id as string),
    document_type: d.document_type,
    ai: d.extraction,
    final: d.corrections,
    created_at: d.created_at,
  }));

  const out = {
    exportedAt: new Date().toISOString(),
    windowDays: days,
    since,
    businesses: code.size,
    counts: { fieldCorrections: fieldCorrections.length, documentPairs: documentPairs.length },
    fieldCorrections,
    documentPairs,
  };

  const json = JSON.stringify(out, null, 2);
  if (toStdout) {
    process.stdout.write(json + '\n');
  } else {
    const dir = dirname(outPath);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, json, 'utf8');
    console.error(
      `Wrote ${out.counts.fieldCorrections} field corrections and ${out.counts.documentPairs} document pairs ` +
        `across ${out.businesses} businesses to ${outPath}`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
