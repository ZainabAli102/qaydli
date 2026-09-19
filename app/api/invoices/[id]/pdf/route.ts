import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/session';
import { getInvoice } from '@/lib/invoice-queries';
import { renderInvoiceHtml } from '@/lib/invoice-html';
import { htmlToPdf, PdfUnavailable } from '@/lib/pdf';
import { displayStatus } from '@/lib/invoices';
import { todayISO } from '@/lib/dates';
import { isLocale, defaultLocale } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// PDF rendering can cold-start Chromium; give the function headroom.
export const maxDuration = 30;

// GET /api/invoices/[id]/pdf?lang=ar
// Renders the invoice to PDF, stores it in the private bucket (pdf_path), and
// streams it back. Auth + RLS scope everything to the caller's business.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, business } = await getSessionContext();
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createClient();
  const invoice = await getInvoice(supabase, id);
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const langParam = req.nextUrl.searchParams.get('lang');
  const locale = isLocale(langParam) ? langParam : defaultLocale;

  const { data: biz } = await supabase
    .from('businesses')
    .select('name, phone, address, logo_path, payment_instructions')
    .eq('id', business.id)
    .maybeSingle();

  let logoUrl: string | null = null;
  if (biz?.logo_path) {
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrl(biz.logo_path, 600);
    logoUrl = signed?.signedUrl ?? null;
  }

  const html = renderInvoiceHtml({
    locale,
    number: invoice.number,
    currency: invoice.currency,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    display: displayStatus({ status: invoice.status, dueDate: invoice.due_date, today: todayISO() }),
    items: invoice.items,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    total: invoice.total,
    paid: invoice.paid,
    notes: invoice.notes,
    business: {
      name: biz?.name ?? business.name,
      phone: biz?.phone ?? null,
      address: biz?.address ?? null,
      paymentInstructions: biz?.payment_instructions ?? null,
      logoUrl,
    },
    client: {
      name: invoice.client?.name ?? invoice.client_name,
      phone: invoice.client?.phone ?? null,
      email: invoice.client?.email ?? null,
    },
  });

  let pdf: Buffer;
  try {
    pdf = await htmlToPdf(html);
  } catch (err) {
    const status = err instanceof PdfUnavailable ? 503 : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status }
    );
  }

  // Store a copy in the private bucket for later re-share (best-effort).
  const path = `${business.id}/invoice-${invoice.id}.pdf`;
  const { error: upErr } = await supabase.storage
    .from('documents')
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (!upErr && invoice.pdf_path !== path) {
    await supabase.from('invoices').update({ pdf_path: path }).eq('id', invoice.id);
  }

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.number}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
