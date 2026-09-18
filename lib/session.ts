import { createClient } from '@/lib/supabase/server';

export type Business = {
  id: string;
  name: string;
  city: string | null;
  base_currency: string;
  usd_iqd_rate: number;
};

// Resolves the signed-in user and their business (if onboarded) on the server.
export async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, business: null as Business | null };

  const { data: profile } = await supabase
    .from('users')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle();

  let business: Business | null = null;
  if (profile?.business_id) {
    const { data } = await supabase
      .from('businesses')
      .select('id, name, city, base_currency, usd_iqd_rate')
      .eq('id', profile.business_id)
      .maybeSingle();
    business = (data as Business) ?? null;
  }

  return { user, business };
}
