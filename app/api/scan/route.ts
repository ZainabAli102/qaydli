import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { extractWithEscalation } from '@/lib/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// POST /api/scan
// Body: { imageBase64: string, mimeType?: string }
// Stores the image in the private 'documents' bucket under the caller's
// business, runs the extraction engine, records a documents row, and returns
// the ReceiptResult. Auth and Storage go through the user-scoped client so RLS
// keeps everything within the caller's business.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('business_id')
    .eq('id', user.id)
    .maybeSingle();
  const businessId = profile?.business_id as string | undefined;
  if (!businessId) {
    return NextResponse.json(
      { error: 'No business found. Complete onboarding first.' },
      { status: 400 }
    );
  }

  let body: { imageBase64?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg';
  if (imageBase64.length < 10) {
    return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
  }

  const ext = EXT[mimeType] ?? 'jpg';
  const docId = randomUUID();
  const storagePath = `${businessId}/${docId}.${ext}`;
  const bytes = Buffer.from(imageBase64, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  let result;
  try {
    result = await extractWithEscalation(imageBase64, { mimeType });
  } catch (err) {
    await supabase.from('documents').insert({
      id: docId,
      business_id: businessId,
      uploaded_by: user.id,
      storage_path: storagePath,
      status: 'failed',
    });
    return NextResponse.json(
      { error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  await supabase.from('documents').insert({
    id: docId,
    business_id: businessId,
    uploaded_by: user.id,
    storage_path: storagePath,
    document_type: result.document_type.value,
    status: 'extracted',
    extraction: result,
  });

  return NextResponse.json({ document_id: docId, storage_path: storagePath, result });
}
