import { redirect, notFound } from 'next/navigation';
import { getSessionContext } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { ReceiptDetailClient } from '@/components/ReceiptDetailClient';

export const dynamic = 'force-dynamic';

// Full receipt photo with a link to its transaction (or Resume if unfiled).
export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, business } = await getSessionContext();
  if (!user) redirect('/login');
  if (!business) redirect('/onboarding');

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: signed } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_path as string, 600);

  const { data: tx } = await supabase
    .from('transactions')
    .select('id')
    .eq('document_id', id)
    .maybeSingle();

  return (
    <ReceiptDetailClient
      imageUrl={signed?.signedUrl ?? null}
      transactionId={(tx?.id as string) ?? null}
      docId={id}
    />
  );
}
