import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getEntryCount, getMonthTransactions, getAllTransactions } from '@/lib/queries';
import { DashboardClient } from '@/components/DashboardClient';
import { FREE_TRIAL_LIMIT, type Category } from '@/lib/domain';
import { currentMonth, isMonth, monthRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; saved?: string }>;
}) {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const { m, saved } = await searchParams;
  const thisMonth = currentMonth(); // Asia/Baghdad — default view after login
  const allTime = m === 'all';
  const month = isMonth(m) ? m : thisMonth;
  const { start: monthStart, nextStart, prev: prevMonth, next: nextMonth } = monthRange(month);

  const supabase = await createClient();
  const [txns, entries] = await Promise.all([
    allTime ? getAllTransactions(supabase) : getMonthTransactions(supabase, monthStart, nextStart),
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

  const savedMonth = isMonth(saved) ? saved : null;

  return (
    <DashboardClient
      businessName={business.name}
      usdIqdRate={business.usd_iqd_rate}
      month={allTime ? 'all' : month}
      thisMonth={thisMonth}
      allTime={allTime}
      prevMonth={prevMonth}
      nextMonth={nextMonth}
      moneyIn={moneyIn}
      moneyOut={moneyOut}
      categories={categories}
      transactions={txns}
      entries={entries}
      trialLimit={FREE_TRIAL_LIMIT}
      savedMonth={savedMonth}
    />
  );
}
