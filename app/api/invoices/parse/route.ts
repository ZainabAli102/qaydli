import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseInvoiceDraft } from '@/lib/invoice-parse';
import { buildBusinessVocab } from '@/lib/vocab';
import { bestClientMatch, matchItemPhrase } from '@/lib/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/invoices/parse  { text: string } -> ParsedInvoiceDraft
// Turns a plain-language description into a draft invoice for the owner to
// confirm. Auth-gated; no data is persisted here. Per-business memory is
// applied BEFORE the reply: known names hint the model, remembered item
// prices fill gaps, and a spoken client name resolves to an existing client.
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
    const vocab = await buildBusinessVocab(supabase).catch(() => null);
    const draft = await parseInvoiceDraft(text, {
      hints: vocab
        ? {
            names: vocab.clients.map((c) => c.name),
            items: vocab.itemPhrases.map((p) => ({ description: p.description, unit_price: p.unit_price })),
          }
        : undefined,
    });

    if (vocab) {
      // Resolve the spoken client name to an existing client (memory wins).
      draft.client_id = bestClientMatch(draft.client_name, vocab.clients, vocab.aliases);
      // Fill a missing unit price from a remembered item phrase.
      draft.items = draft.items.map((it) => {
        if (it.unit_price > 0) return it;
        const remembered = matchItemPhrase(it.description, vocab.itemPhrases);
        return remembered ? { ...it, unit_price: remembered.unit_price } : it;
      });
    }

    return NextResponse.json({ draft, model: process.env.OPENAI_MODEL || 'gpt-4o' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
