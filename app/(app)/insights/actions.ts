'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';

// Owner marks/unmarks a detected group (vendor or category) as recurring.
export async function setRecurring(
  groupKey: string,
  isRecurring: boolean
): Promise<{ error?: string }> {
  const { user, business } = await getSessionContext();
  if (!user || !business) return { error: 'auth' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('recurring_marks')
    .upsert(
      { business_id: business.id, group_key: groupKey, is_recurring: isRecurring, updated_at: new Date().toISOString() },
      { onConflict: 'business_id,group_key' }
    );
  if (error) {
    console.error('[setRecurring] upsert failed:', error);
    return { error: error.message };
  }
  revalidatePath('/insights');
  return {};
}
