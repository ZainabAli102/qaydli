import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseInvoiceDraft } from '@/lib/invoice-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/invoices/parse  { text: string } -> ParsedInvoiceDraft
// Turns a plain-language description into a draft invoice for the owner to
// confirm. Auth-gated; no data is persisted here.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 3) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  try {
    const draft = await parseInvoiceDraft(text);
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
