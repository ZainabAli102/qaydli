import { redirect, notFound } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { getInvoice } from '@/lib/invoice-queries';
import { todayISO } from '@/lib/dates';
import { InvoiceDetailClient } from '@/components/InvoiceDetailClient';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  const invoice = await getInvoice(supabase, id);
  if (!invoice) notFound();

  return (
    <InvoiceDetailClient invoice={invoice} businessName={business.name} today={todayISO()} />
  );
}
