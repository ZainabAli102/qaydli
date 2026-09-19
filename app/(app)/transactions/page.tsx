import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getMonthTransactions } from '@/lib/queries';
import { currentMonth, isMonth, monthRange } from '@/lib/dates';
import { TransactionsClient } from '@/components/TransactionsClient';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const { m } = await searchParams;
  const month = isMonth(m) ? m : currentMonth();
  const { start, nextStart, prev, next } = monthRange(month);

  const supabase = await createClient();
  const txns = await getMonthTransactions(supabase, start, nextStart);

  return (
    <TransactionsClient
      month={month}
      prevMonth={prev}
      nextMonth={next}
      usdIqdRate={business.usd_iqd_rate}
      transactions={txns}
    />
  );
}
