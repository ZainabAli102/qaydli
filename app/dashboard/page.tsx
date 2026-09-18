import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getEntryCount, getMonthTransactions } from '@/lib/queries';
import { DashboardClient } from '@/components/DashboardClient';
import { FREE_TRIAL_LIMIT, type Category } from '@/lib/domain';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(2, '0');

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const { m } = await searchParams;
  const now = new Date();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, mo] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const nextStart = mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`;
  const prevMonth = mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`;
  const nextMonth = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;

  const supabase = await createClient();
  const [txns, entries] = await Promise.all([
    getMonthTransactions(supabase, monthStart, nextStart),
    getEntryCount(supabase),
  ]);

  let moneyIn = 0;
  let moneyOut = 0;
  const byCategory: Record<string, number> = {};
  for (const tx of txns) {
    if (tx.direction === 'in') moneyIn += tx.amount;
    else {
      moneyOut += tx.amount;
      const c = (tx.category as Category) ?? 'other';
      byCategory[c] = (byCategory[c] ?? 0) + tx.amount;
    }
  }
  const categories = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <DashboardClient
      businessName={business.name}
      usdIqdRate={business.usd_iqd_rate}
      month={month}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      moneyIn={moneyIn}
      moneyOut={moneyOut}
      categories={categories}
      transactions={txns}
      entries={entries}
      trialLimit={FREE_TRIAL_LIMIT}
    />
  );
}
