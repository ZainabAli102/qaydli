import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { renderInvoiceHtml } from '@/lib/invoice-html';
import { displayStatus } from '@/lib/invoices';
import { todayISO } from '@/lib/dates';
import { isLocale, defaultLocale } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /i/<token> — public, read-only invoice. The token is the capability; the
// service client looks it up past RLS and returns only presentation fields. The
// same template as the PDF, so the shared page and the file look identical.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const langParam = req.nextUrl.searchParams.get('lang');
  const locale = isLocale(langParam) ? langParam : defaultLocale;

  const supabase = createServiceClient();
  const { data: inv } = await supabase
    .from('invoices')
    .select(
      'id, business_id, number, currency, issue_date, due_date, status, items, subtotal, discount, total, usd_iqd_rate, notes, client_id, businesses(name, phone, address, email, tax_number, accent_color, invoice_footer, logo_path, payment_instructions), clients(name, phone, email, address)'
    )
    .eq('public_token', token)
    .maybeSingle();

  if (!inv) {
    return new NextResponse('Invoice not found', { status: 404 });
  }

  const { data: pays } = await supabase
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', inv.id);
  const paid = ((pays ?? []) as Array<{ amount: number }>).reduce((s, p) => s + Number(p.amount), 0);

  const biz = (Array.isArray(inv.businesses) ? inv.businesses[0] : inv.businesses) as
    | {
        name: string;
        phone: string | null;
        address: string | null;
        email: string | null;
        tax_number: string | null;
        accent_color: string | null;
        invoice_footer: string | null;
        logo_path: string | null;
        payment_instructions: string | null;
      }
    | null;
  const client = (Array.isArray(inv.clients) ? inv.clients[0] : inv.clients) as
    | { name: string | null; phone: string | null; email: string | null; address: string | null }
    | null;

  let logoUrl: string | null = null;
  if (biz?.logo_path) {
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrl(biz.logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  const html = renderInvoiceHtml({
    locale,
    number: inv.number,
    currency: inv.currency,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    display: displayStatus({ status: inv.status, dueDate: inv.due_date, today: todayISO() }),
    items: Array.isArray(inv.items) ? inv.items : [],
    subtotal: Number(inv.subtotal),
    discount: Number(inv.discount),
    total: Number(inv.total),
    paid,
    notes: inv.notes,
    accent: biz?.accent_color ?? null,
    usdIqdRate: Number(inv.usd_iqd_rate) || 0,
    business: {
      name: biz?.name ?? '',
      phone: biz?.phone ?? null,
      address: biz?.address ?? null,
      email: biz?.email ?? null,
      taxNumber: biz?.tax_number ?? null,
      paymentInstructions: biz?.payment_instructions ?? null,
      footer: biz?.invoice_footer ?? null,
      logoUrl,
    },
    client: {
      name: client?.name ?? null,
      phone: client?.phone ?? null,
      address: client?.address ?? null,
      email: client?.email ?? null,
    },
  });

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
