import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  weeklyAccuracy,
  topCorrectionPatterns,
  type CorrectionRow,
  type EntryRow,
} from '@/lib/accuracy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/admin/accuracy  — learning-loop health across ALL businesses.
// Protected by the ADMIN_TOKEN env (header `x-admin-token`, `Authorization:
// Bearer <token>`, or `?token=`). Uses the service-role client to read past
// RLS. Returns the weekly "fields corrected per entry" trend and the top 20
// recurring correction patterns, globally and per business.
//
// Query: ?days=<n>  window size (default 90, max 365).

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const got =
    req.headers.get('x-admin-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.nextUrl.searchParams.get('token') ??
    '';
  // Length-guarded comparison (avoids leaking length via early return only).
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

interface WithBusiness {
  business_id: string;
  created_at: string;
}

function groupBy<T extends { business_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(r.business_id);
    if (arr) arr.push(r);
    else m.set(r.business_id, [r]);
  }
  return m;
}

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: 'ADMIN_TOKEN is not configured' }, { status: 503 });
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 90));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const supabase = createServiceClient();
  const [corrRes, txnRes, invRes] = await Promise.all([
    supabase
      .from('corrections')
      .select('business_id, field, ai_value, final_value, created_at')
      .gte('created_at', since)
      .limit(50000),
    supabase
      .from('transactions')
      .select('business_id, created_at')
      .is('invoice_id', null)
      .gte('created_at', since)
      .limit(50000),
    supabase
      .from('invoices')
      .select('business_id, created_at')
      .gte('created_at', since)
      .limit(50000),
  ]);

  if (corrRes.error || txnRes.error || invRes.error) {
    const msg = corrRes.error?.message || txnRes.error?.message || invRes.error?.message;
    return NextResponse.json({ error: msg || 'Query failed' }, { status: 500 });
  }

  const corrections = (corrRes.data as Array<CorrectionRow & WithBusiness>) ?? [];
  const entries: Array<EntryRow & WithBusiness> = [
    ...((txnRes.data as WithBusiness[]) ?? []),
    ...((invRes.data as WithBusiness[]) ?? []),
  ];

  const global = {
    entries: entries.length,
    corrections: corrections.length,
    weekly: weeklyAccuracy(entries, corrections),
    topPatterns: topCorrectionPatterns(corrections, 20),
  };

  const corrByBiz = groupBy(corrections);
  const entryByBiz = groupBy(entries);
  const businessIds = new Set<string>([...corrByBiz.keys(), ...entryByBiz.keys()]);
  const perBusiness = [...businessIds]
    .map((id) => {
      const c = corrByBiz.get(id) ?? [];
      const e = entryByBiz.get(id) ?? [];
      return {
        business_id: id,
        entries: e.length,
        corrections: c.length,
        weekly: weeklyAccuracy(e, c),
        topPatterns: topCorrectionPatterns(c, 20),
      };
    })
    .sort((a, b) => b.corrections - a.corrections);

  return NextResponse.json({
    windowDays: days,
    since,
    generatedAt: new Date().toISOString(),
    global,
    perBusiness,
  });
}
