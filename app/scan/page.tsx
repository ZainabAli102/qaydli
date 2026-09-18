import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { getEntryCount } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { ScanClient } from '@/components/ScanClient';
import { BottomNav } from '@/components/BottomNav';
import { FREE_TRIAL_LIMIT } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  const entries = await getEntryCount(supabase);
  if (entries >= FREE_TRIAL_LIMIT) redirect('/upgrade');

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1">
        <ScanClient businessName={business.name} demoImageUrl="/demo/sample-receipt.webp" />
      </div>
      <BottomNav />
    </div>
  );
}
