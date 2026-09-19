import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { OnboardingForm } from '@/components/OnboardingForm';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (business) redirect('/scan');
  return <OnboardingForm />;
}
