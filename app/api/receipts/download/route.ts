import { NextResponse, type NextRequest } from 'next/server';
import JSZip from 'jszip';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getMonthTransactions } from '@/lib/queries';
import { transactionsToCsv } from '@/lib/csv';
import { currentMonth, isMonth, monthRange } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXT_FROM_PATH = (p: string) => {
  const m = /\.([a-z0-9]+)$/i.exec(p);
  return m ? m[1].toLowerCase() : 'jpg';
};
const safe = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'receipt';

// GET /api/receipts/download?m=YYYY-MM -> zip of the month's photos + the CSV.
// Storage access goes through the user client, so RLS keeps it business-scoped.
export async function GET(req: NextRequest) {
  const { user, business } = await getSessionContext();
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const m = req.nextUrl.searchParams.get('m');
  const month = isMonth(m) ? m : currentMonth();
  const { start, nextStart } = monthRange(month);

  const supabase = await createClient();
  const txns = await getMonthTransactions(supabase, start, nextStart);

  const zip = new JSZip();
  zip.file(`qaydli-${month}.csv`, transactionsToCsv(txns));

  // Photos for the month's transactions that have a document.
  const withDocs = txns.filter((t) => (t as { document_id?: string | null }).document_id);
  const docIds = withDocs.map((t) => (t as { document_id: string }).document_id);

  if (docIds.length) {
    const { data: docs } = await supabase
      .from('documents')
      .select('id, storage_path')
      .in('id', docIds);
    const pathById = new Map<string, string>();
    for (const d of (docs ?? []) as Array<{ id: string; storage_path: string }>) {
      pathById.set(d.id, d.storage_path);
    }

    const photos = zip.folder('photos')!;
    let i = 0;
    for (const t of withDocs) {
      i += 1;
      const path = pathById.get((t as { document_id: string }).document_id);
      if (!path) continue;
      const { data: blob, error } = await supabase.storage.from('documents').download(path);
      if (error || !blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());
      const label = safe(`${t.occurred_on ?? month}-${t.vendor ?? 'receipt'}`);
      photos.file(`${String(i).padStart(2, '0')}-${label}.${EXT_FROM_PATH(path)}`, buf);
    }
  }

  const zipped = await zip.generateAsync({ type: 'nodebuffer' });
  return new NextResponse(new Uint8Array(zipped), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="qaydli-${month}.zip"`,
    },
  });
}
