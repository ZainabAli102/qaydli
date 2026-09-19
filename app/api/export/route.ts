import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getMonthTransactions } from '@/lib/queries';
import { transactionsToCsv } from '@/lib/csv';
import { currentMonth, isMonth, monthRange } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/export?m=YYYY-MM  ->  CSV of that month's transactions.
export async function GET(req: NextRequest) {
  const { user, business } = await getSessionContext();
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const m = req.nextUrl.searchParams.get('m');
  const month = isMonth(m) ? m : currentMonth();
  const { start, nextStart } = monthRange(month);

  const supabase = await createClient();
  const txns = await getMonthTransactions(supabase, start, nextStart);

  return new NextResponse(transactionsToCsv(txns), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="qaydli-${month}.csv"`,
    },
  });
}
