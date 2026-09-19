import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// POST /api/settings/logo  { imageBase64, mimeType } -> { logoUrl }
// Stores the business logo in the private 'documents' bucket and records its key.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle();
  const businessId = profile?.business_id as string | undefined;
  if (!businessId) return NextResponse.json({ error: 'No business' }, { status: 400 });

  let body: { imageBase64?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg';
  if (imageBase64.length < 10) return NextResponse.json({ error: 'image is required' }, { status: 400 });

  const ext = EXT[mimeType] ?? 'jpg';
  const path = `${businessId}/logo-${randomUUID()}.${ext}`;
  const bytes = Buffer.from(imageBase64, 'base64');

  const { error: upErr } = await supabase.storage
    .from('documents')
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Point the business at the new logo (and forget the old key).
  const { data: prev } = await supabase
    .from('businesses')
    .select('logo_path')
    .eq('id', businessId)
    .maybeSingle();
  await supabase.from('businesses').update({ logo_path: path }).eq('id', businessId);
  if (prev?.logo_path && prev.logo_path !== path) {
    await supabase.storage.from('documents').remove([prev.logo_path]);
  }

  const { data: signed } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
  return NextResponse.json({ logoUrl: signed?.signedUrl ?? null });
}
