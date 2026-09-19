import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getTransactionsBetween, getRecurringOverrides } from '@/lib/queries';
import { computeInsights, type TxnLike } from '@/lib/insights';
import { currentMonth, isMonth, monthRange, lastMonths } from '@/lib/dates';
import { InsightsClient } from '@/components/InsightsClient';

export const dynamic = 'force-dynamic';

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const { m } = await searchParams;
  const month = isMonth(m) ? m : currentMonth();
  const months = lastMonths(month, 6);
  const windowStart = `${months[0]}-01`;
  const { nextStart, prev, next } = monthRange(month);

  const supabase = await createClient();
  const [txns, overrides] = await Promise.all([
    getTransactionsBetween(supabase, windowStart, nextStart),
    getRecurringOverrides(supabase),
  ]);

  const insights = computeInsights(txns as TxnLike[], {
    month,
    months,
    recurringOverrides: overrides,
  });

  return (
    <InsightsClient
      month={month}
      prevMonth={prev}
      nextMonth={next}
      usdIqdRate={business.usd_iqd_rate}
      insights={insights}
    />
  );
}
