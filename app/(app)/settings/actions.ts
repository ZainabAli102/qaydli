'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';

export type SettingsResult = { ok: true } | { error: string };

export async function updateSettings(input: {
  phone: string;
  address: string;
  paymentInstructions: string;
  usdRate: number;
}): Promise<SettingsResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'Your session has expired. Please sign in again.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('businesses')
    .update({
      phone: input.phone.trim() || null,
      address: input.address.trim() || null,
      payment_instructions: input.paymentInstructions.trim() || null,
      usd_iqd_rate: input.usdRate > 0 ? input.usdRate : business.usd_iqd_rate,
    })
    .eq('id', business.id);
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

export async function removeLogo(): Promise<SettingsResult> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'Your session has expired. Please sign in again.' };
  const supabase = await createClient();
  const { data: biz } = await supabase
    .from('businesses')
    .select('logo_path')
    .eq('id', business.id)
    .maybeSingle();
  if (biz?.logo_path) {
    await supabase.storage.from('documents').remove([biz.logo_path]);
  }
  const { error } = await supabase.from('businesses').update({ logo_path: null }).eq('id', business.id);
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}
