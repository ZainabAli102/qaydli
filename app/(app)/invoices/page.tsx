import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getInvoices } from '@/lib/invoice-queries';
import { todayISO } from '@/lib/dates';
import { InvoicesClient } from '@/components/InvoicesClient';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  const invoices = await getInvoices(supabase);

  return <InvoicesClient invoices={invoices} today={todayISO()} />;
}
