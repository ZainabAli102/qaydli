import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { SettingsClient } from '@/components/SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  const { data: biz } = await supabase
    .from('businesses')
    .select('name, phone, address, logo_path, payment_instructions, usd_iqd_rate')
    .eq('id', business.id)
    .maybeSingle();

  let logoUrl: string | null = null;
  if (biz?.logo_path) {
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrl(biz.logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  return (
    <SettingsClient
      name={biz?.name ?? business.name}
      phone={biz?.phone ?? ''}
      address={biz?.address ?? ''}
      paymentInstructions={biz?.payment_instructions ?? ''}
      usdRate={biz?.usd_iqd_rate ?? business.usd_iqd_rate}
      logoUrl={logoUrl}
    />
  );
}
