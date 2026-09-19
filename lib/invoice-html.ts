// Pure invoice → HTML. One template feeds both the public web page and the PDF,
// so they look identical. RTL-correct for Arabic/Kurdish (dir on <html>, logical
// alignment). Google Fonts (Noto) so Arabic/Kurdish shape correctly even in a
// headless browser that has no Arabic system font. No I/O here.

import { t, dir, type Locale } from '@/lib/i18n';
import { formatMoney, type Currency } from '@/lib/money';
import { lineTotal, type DisplayStatus, type InvoiceItem } from '@/lib/invoices';

export interface InvoiceHtmlData {
  locale: Locale;
  number: string;
  currency: Currency;
  issueDate: string;
  dueDate: string | null;
  display: DisplayStatus;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  notes: string | null;
  business: {
    name: string;
    phone: string | null;
    address: string | null;
    paymentInstructions: string | null;
    logoUrl: string | null;
  };
  client: { name: string | null; phone: string | null; email: string | null };
}

const STATUS_COLOR: Record<DisplayStatus, string> = {
  draft: '#64748b',
  sent: '#0284c7',
  partial: '#d97706',
  paid: '#16a34a',
  overdue: '#dc2626',
};

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

export function renderInvoiceHtml(d: InvoiceHtmlData): string {
  const tr = (k: string) => t(d.locale, k);
  const money = (n: number) => formatMoney(n, d.currency);
  const rtl = dir(d.locale) === 'rtl';
  const balance = Math.max(0, d.total - d.paid);
  const partiallyPaid = d.paid > 0 && balance > 0;

  const rows = d.items
    .map(
      (it) => `
      <tr>
        <td class="desc">${esc(it.description) || '—'}</td>
        <td class="num">${esc(String(it.qty))}</td>
        <td class="num">${money(it.unit_price)}</td>
        <td class="num">${money(lineTotal(it))}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="${d.locale}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans', 'Noto Naskh Arabic', system-ui, -apple-system, sans-serif;
    color: #0f172a; background: #fff; font-size: 14px; line-height: 1.5;
  }
  .sheet { max-width: 720px; margin: 0 auto; padding: 32px 28px; }
  .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .logo { height: 56px; width: auto; border-radius: 8px; object-fit: contain; }
  .biz-name { font-size: 20px; font-weight: 700; color: #0f766e; }
  .muted { color: #64748b; font-size: 13px; }
  .doc { text-align: ${rtl ? 'left' : 'right'}; }
  .doc .number { font-size: 22px; font-weight: 700; }
  .badge {
    display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px;
    color: #fff; font-size: 12px; font-weight: 700;
  }
  .parties { display: flex; gap: 24px; margin: 24px 0 8px; }
  .label { font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: ${rtl ? 'right' : 'left'}; font-size: 12px; color: #94a3b8; border-bottom: 2px solid #e2e8f0; padding: 8px 6px; }
  td { padding: 10px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  td.num, th.num { text-align: ${rtl ? 'left' : 'right'}; white-space: nowrap; }
  .totals { margin-${rtl ? 'right' : 'left'}: auto; margin-top: 14px; width: 280px; }
  .totals .line { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #e2e8f0; margin-top: 6px; padding-top: 8px; font-size: 18px; font-weight: 700; }
  .totals .grand .v { color: #0f766e; }
  .totals .balance { color: #dc2626; font-weight: 700; }
  .pay { margin-top: 24px; padding: 12px 14px; background: #f8fafc; border-radius: 10px; }
  .notes { margin-top: 16px; color: #475569; }
  .foot { margin-top: 28px; text-align: center; color: #94a3b8; font-size: 12px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .sheet { padding: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        ${d.business.logoUrl ? `<img class="logo" src="${esc(d.business.logoUrl)}" alt="">` : ''}
        <div>
          <div class="biz-name">${esc(d.business.name)}</div>
          ${d.business.phone ? `<div class="muted">${esc(d.business.phone)}</div>` : ''}
          ${d.business.address ? `<div class="muted">${esc(d.business.address)}</div>` : ''}
        </div>
      </div>
      <div class="doc">
        <div class="label">${esc(tr('inv.invoiceNo'))}</div>
        <div class="number">${esc(d.number)}</div>
        <div class="badge" style="background:${STATUS_COLOR[d.display]}">${esc(tr(`inv.status.${d.display}`))}</div>
      </div>
    </div>

    <div class="parties">
      <div style="flex:1">
        <div class="label">${esc(tr('inv.billTo'))}</div>
        <div style="font-weight:600">${esc(d.client.name) || '—'}</div>
        ${d.client.phone ? `<div class="muted">${esc(d.client.phone)}</div>` : ''}
        ${d.client.email ? `<div class="muted">${esc(d.client.email)}</div>` : ''}
      </div>
      <div style="text-align:${rtl ? 'left' : 'right'}">
        <div><span class="label">${esc(tr('inv.date'))}:</span> ${esc(d.issueDate)}</div>
        ${d.dueDate ? `<div><span class="label">${esc(tr('inv.due'))}:</span> ${esc(d.dueDate)}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>${esc(tr('inv.itemDesc'))}</th>
          <th class="num">${esc(tr('inv.qty'))}</th>
          <th class="num">${esc(tr('inv.unitPrice'))}</th>
          <th class="num">${esc(tr('inv.lineTotal'))}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="line"><span class="muted">${esc(tr('inv.subtotal'))}</span><span>${money(d.subtotal)}</span></div>
      ${d.discount > 0 ? `<div class="line"><span class="muted">${esc(tr('inv.discount'))}</span><span>− ${money(d.discount)}</span></div>` : ''}
      <div class="line grand"><span>${esc(tr('inv.total'))}</span><span class="v">${money(d.total)}</span></div>
      ${
        partiallyPaid
          ? `<div class="line"><span class="muted">${esc(tr('inv.paidSoFar'))}</span><span>${money(d.paid)}</span></div>
             <div class="line balance"><span>${esc(tr('inv.balanceDue'))}</span><span>${money(balance)}</span></div>`
          : ''
      }
    </div>

    ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}
    ${
      d.business.paymentInstructions
        ? `<div class="pay"><div class="label">${esc(tr('inv.paymentInstructions'))}</div><div>${esc(d.business.paymentInstructions)}</div></div>`
        : ''
    }

    <div class="foot">${esc(tr('inv.publicIntro'))} ${esc(d.business.name)}</div>
  </div>
</body>
</html>`;
}
