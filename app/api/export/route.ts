import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getMonthTransactions } from '@/lib/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');
const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// GET /api/export?m=YYYY-MM  ->  CSV of that month's transactions.
export async function GET(req: NextRequest) {
  const { user, business } = await getSessionContext();
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const m = req.nextUrl.searchParams.get('m');
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, mo] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const nextStart = mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`;

  const supabase = await createClient();
  const txns = await getMonthTransactions(supabase, monthStart, nextStart);

  const header = [
    'date',
    'vendor',
    'type',
    'category',
    'payment_method',
    'amount_iqd',
    'original_amount',
    'original_currency',
    'notes',
  ];
  const rows = txns.map((t) =>
    [
      t.occurred_on ?? '',
      t.vendor ?? '',
      t.direction === 'in' ? 'income' : 'expense',
      t.category ?? '',
      t.payment_method ?? '',
      t.amount,
      t.original_amount ?? '',
      t.original_currency ?? '',
      t.notes ?? '',
    ]
      .map(esc)
      .join(',')
  );
  const csv = '﻿' + [header.map(esc).join(','), ...rows].join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="qaydli-${month}.csv"`,
    },
  });
}
