import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getTransactionsBetween, getRecurringOverrides } from '@/lib/queries';
import { computeInsights } from '@/lib/insights';
import { currentMonth, isMonth, monthRange, lastMonths } from '@/lib/dates';
import { monthLabel } from '@/lib/month-label';
import { t, isLocale, type Locale } from '@/lib/i18n';
import { generateSummary, type SummaryNumbers } from '@/lib/summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIN_TXNS = 5;

// GET /api/insights/summary?m=YYYY-MM&lang=en|ar|ckb
export async function GET(req: NextRequest) {
  const { user, business } = await getSessionContext();
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mParam = req.nextUrl.searchParams.get('m');
  const month = isMonth(mParam) ? mParam : currentMonth();
  const langParam = req.nextUrl.searchParams.get('lang');
  const lang: Locale = isLocale(langParam) ? langParam : 'en';

  const months = lastMonths(month, 6);
  const windowStart = `${months[0]}-01`;
  const { nextStart } = monthRange(month);

  const supabase = await createClient();
  const [txns, overrides] = await Promise.all([
    getTransactionsBetween(supabase, windowStart, nextStart),
    getRecurringOverrides(supabase),
  ]);

  const monthTxns = txns.filter((x) => x.occurred_on?.slice(0, 7) === month);
  if (monthTxns.length < MIN_TXNS) {
    return NextResponse.json({ locked: true, count: monthTxns.length, need: MIN_TXNS });
  }

  const ins = computeInsights(txns, { month, months, recurringOverrides: overrides });

  // Signature: any add/edit/delete in the month changes it → regenerate.
  const sumIn = monthTxns.filter((x) => x.direction === 'in').reduce((s, x) => s + x.amount, 0);
  const sumOut = monthTxns.filter((x) => x.direction === 'out').reduce((s, x) => s + x.amount, 0);
  const maxCreated = monthTxns.reduce((mx, x) => (x.created_at > mx ? x.created_at : mx), '');
  const signature = `${monthTxns.length}:${sumIn}:${sumOut}:${maxCreated}`;

  // Cache hit?
  const { data: cached } = await supabase
    .from('insight_summaries')
    .select('summary, signature')
    .eq('month', month)
    .eq('lang', lang)
    .maybeSingle();
  if (cached && cached.signature === signature) {
    return NextResponse.json({ summary: cached.summary, cached: true });
  }

  const topCat = ins.categories[0] ?? null;
  const topVendor = ins.topVendors[0] ?? null;
  const numbers: SummaryNumbers = {
    monthLabel: monthLabel(month, lang),
    moneyIn: ins.thisMonth.in,
    moneyOut: ins.thisMonth.out,
    profit: ins.thisMonth.profit,
    profitDeltaPct: ins.delta.profit == null ? null : Math.round(ins.delta.profit),
    topCategoryLabel: topCat ? t(lang, `cat.${topCat.category}`) : null,
    topCategoryAmount: topCat?.amount ?? 0,
    topVendorLabel: topVendor?.vendor ?? null,
    topVendorAmount: topVendor?.amount ?? 0,
    fixedTotal: ins.recurring.fixedTotal,
    unusualCount: ins.unusual.length,
  };

  const summary = await generateSummary(numbers, lang);

  await supabase.from('insight_summaries').upsert(
    {
      business_id: business.id,
      month,
      lang,
      summary,
      signature,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,month,lang' }
  );

  return NextResponse.json({ summary, cached: false });
}
