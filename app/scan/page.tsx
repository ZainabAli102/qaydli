import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { ScanClient } from '@/components/ScanClient';

export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');
  return <ScanClient businessName={business.name} />;
}
