import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getEntryCount } from '@/lib/queries';
import { FREE_TRIAL_LIMIT } from '@/lib/domain';
import { todayISO } from '@/lib/dates';
import { ReviewForm, type ReviewInitial } from '@/components/ReviewForm';

export const dynamic = 'force-dynamic';

// Manual entry: the same Review form, empty, date defaulting to today. Counts
// toward the trial like a scanned entry (guarded below and again on save).
export default async function ManualPage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  if ((await getEntryCount(supabase)) >= FREE_TRIAL_LIMIT) redirect('/upgrade');

  const today = todayISO(); // Asia/Baghdad

  const initial: ReviewInitial = {
    documentId: null,
    imageUrl: null,
    usdIqdRate: business.usd_iqd_rate,
    vendor: '',
    vendorLatin: '',
    invoiceNumber: '',
    date: today,
    currency: 'IQD',
    total: null,
    paid: null,
    remaining: null,
    lineItems: [],
    notes: '',
    flags: [],
    category: 'other',
    categorySuggested: false,
    paymentMethod: 'cash',
    type: 'expense',
    fromMemory: false,
    conf: { vendor: 0, date: 0, total: 0, currency: 0 },
    manual: true,
  };

  return <ReviewForm initial={initial} />;
}
