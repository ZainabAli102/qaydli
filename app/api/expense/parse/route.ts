import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseExpenseDraft } from '@/lib/expense-parse';
import { buildBusinessVocab } from '@/lib/vocab';
import { lookupCategoryVocab } from '@/lib/memory';
import { isCategory, type Category } from '@/lib/domain';
import { todayISO } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/expense/parse  { text: string } -> ParsedExpenseDraft
// Turns a plain-language description into a draft transaction for the owner to
// confirm. Auth-gated; nothing is persisted here. Per-business memory is
// applied BEFORE the reply: known names hint the model and the owner's own
// category vocabulary overrides the model's category guess.
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
    const draft = await parseExpenseDraft(text, {
      todayISO: todayISO(),
      hints: vocab ? { names: vocab.clients.map((c) => c.name) } : undefined,
    });

    if (vocab) {
      // Owner's learned vocabulary wins over the model's category guess. Match
      // on the vendor first, then the whole note.
      const learned = lookupCategoryVocab(draft.vendor, vocab.categoryVocab) ?? lookupCategoryVocab(text, vocab.categoryVocab);
      if (learned && isCategory(learned)) draft.category = learned as Category;
    }

    return NextResponse.json({ draft, model: process.env.OPENAI_MODEL || 'gpt-4o' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
