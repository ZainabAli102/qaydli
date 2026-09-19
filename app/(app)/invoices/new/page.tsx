import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getEntryCount } from '@/lib/queries';
import { getClients } from '@/lib/invoice-queries';
import { FREE_TRIAL_LIMIT } from '@/lib/domain';
import { todayISO } from '@/lib/dates';
import { InvoiceForm } from '@/components/InvoiceForm';

export const dynamic = 'force-dynamic';

export default async function NewInvoicePage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  if ((await getEntryCount(supabase)) >= FREE_TRIAL_LIMIT) redirect('/upgrade');

  const clients = await getClients(supabase);

  return (
    <InvoiceForm clients={clients} usdIqdRate={business.usd_iqd_rate} today={todayISO()} />
  );
}
