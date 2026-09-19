import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { UpgradeClient } from '@/components/UpgradeClient';

export const dynamic = 'force-dynamic';

export default async function UpgradePage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');
  return <UpgradeClient />;
}
