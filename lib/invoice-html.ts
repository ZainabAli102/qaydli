// Pure invoice → HTML. Feeds the public page and the Settings live preview
// (the PDF is rendered separately by lib/invoice-pdf.tsx to the same design).
// RTL-correct for Arabic/Kurdish (dir on <html>), Western digits throughout.
// Google Fonts (Noto) so Arabic/Kurdish shape correctly in any browser.

import { t, dir, interpolate, type Locale } from '@/lib/i18n';
import { formatMoney, type Currency } from '@/lib/money';
import { normalizeHex, DEFAULT_ACCENT, lineTotal, type DisplayStatus, type InvoiceItem } from '@/lib/invoices';
import { formatDate, formatAmount, currencyLabel, altCurrency } from '@/lib/invoice-format';

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
  /** Accent colour for table header, lines and the amount bar. */
  accent?: string | null;
  /** Business USD↔IQD rate, for the small equivalent under the total. */
  usdIqdRate?: number;
  business: {
    name: string;
    phone: string | null;
    address: string | null;
    email?: string | null;
    taxNumber?: string | null;
    paymentInstructions: string | null;
    footer?: string | null;
    logoUrl: string | null;
  };
  client: { name: string | null; phone: string | null; address?: string | null; email: string | null };
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
  const rtl = dir(d.locale) === 'rtl';
  const accent = normalizeHex(d.accent, DEFAULT_ACCENT);
  const cur = currencyLabel(d.currency);
  const money = (n: number) => formatMoney(n, d.currency);
  const amt = (n: number) => formatAmount(n, d.currency);
  const balance = Math.max(0, d.total - d.paid);
  const hasPayment = d.paid > 0;
  const equiv = altCurrency(d.total, d.currency, d.usdIqdRate ?? 0);
  const statusColor = STATUS_COLOR[d.display];

  const rows = d.items
    .map(
      (it, i) => `
      <tr>
        <td class="idx">${i + 1}</td>
        <td class="desc">${esc(it.description) || '—'}</td>
        <td class="num">${esc(String(it.qty))}</td>
        <td class="num">${amt(it.unit_price)}</td>
        <td class="num">${amt(lineTotal(it))}</td>
      </tr>`
    )
    .join('');

  const grandRow = (labelKey: string, value: string) =>
    `<div class="grand"><span>${esc(tr(labelKey))}</span><span>${value}</span></div>`;

  const totalsInner = hasPayment
    ? `
      <div class="tline"><span class="muted">${esc(tr('inv.subtotal'))}</span><span>${money(d.subtotal)}</span></div>
      ${d.discount > 0 ? `<div class="tline"><span class="muted">${esc(tr('inv.discount'))}</span><span>− ${money(d.discount)}</span></div>` : ''}
      <div class="tline strong"><span>${esc(tr('inv.total'))}</span><span>${money(d.total)}</span></div>
      ${equiv ? `<div class="equiv">${esc(equiv)}</div>` : ''}
      <div class="tline"><span class="muted">${esc(tr('inv.paidToDate'))}</span><span>${money(d.paid)}</span></div>
      ${grandRow('inv.balanceDue', money(balance))}`
    : `
      <div class="tline"><span class="muted">${esc(tr('inv.subtotal'))}</span><span>${money(d.subtotal)}</span></div>
      ${d.discount > 0 ? `<div class="tline"><span class="muted">${esc(tr('inv.discount'))}</span><span>− ${money(d.discount)}</span></div>` : ''}
      ${grandRow('inv.total', money(d.total))}
      ${equiv ? `<div class="equiv">${esc(equiv)}</div>` : ''}`;

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
    color: #0f172a; background: #fff; font-size: 13px; line-height: 1.5;
  }
  .sheet { max-width: 760px; margin: 0 auto; padding: 40px 40px 28px; }
  .top { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
  .brand { display: flex; gap: 12px; align-items: flex-start; }
  .logo { height: 60px; width: auto; max-width: 160px; border-radius: 8px; object-fit: contain; }
  .biz-name { font-size: 19px; font-weight: 700; color: ${accent}; margin-bottom: 2px; }
  .muted { color: #64748b; font-size: 12px; }
  .doc { text-align: ${rtl ? 'left' : 'right'}; min-width: 190px; }
  .stamp {
    display: inline-block; padding: 3px 10px; border: 2px solid ${statusColor}; color: ${statusColor};
    border-radius: 6px; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase;
  }
  .inv-word { font-size: 30px; font-weight: 800; letter-spacing: .04em; color: #0f172a; margin: 8px 0 2px; text-transform: uppercase; }
  .inv-no { font-size: 14px; font-weight: 700; color: ${accent}; margin-bottom: 6px; }
  .docline { font-size: 12px; color: #334155; }
  .docline .k { color: #94a3b8; }
  .label { font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .billto { margin: 26px 0 10px; }
  .billto .name { font-weight: 700; font-size: 14px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead th {
    background: ${accent}; color: #fff; font-size: 11px; font-weight: 700; padding: 8px 8px;
    text-align: ${rtl ? 'right' : 'left'};
  }
  thead th.idx { width: 26px; text-align: center; }
  thead th.num { text-align: ${rtl ? 'left' : 'right'}; white-space: nowrap; }
  tbody td { padding: 8px 8px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td.idx { width: 26px; text-align: center; color: #94a3b8; }
  td.num { text-align: ${rtl ? 'left' : 'right'}; white-space: nowrap; }
  .totals { margin-${rtl ? 'right' : 'left'}: auto; margin-top: 16px; width: 300px; }
  .tline { display: flex; justify-content: space-between; padding: 4px 2px; }
  .tline.strong { font-weight: 700; border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 8px; }
  .equiv { text-align: ${rtl ? 'left' : 'right'}; color: #94a3b8; font-size: 11px; padding: 0 2px 2px; }
  .grand {
    display: flex; justify-content: space-between; align-items: center;
    background: ${accent}; color: #fff; margin-top: 8px; padding: 11px 12px;
    border-radius: 8px; font-size: 17px; font-weight: 700;
  }
  .pay { margin-top: 22px; padding: 12px 14px; background: #f8fafc; border-radius: 10px; border-inline-start: 3px solid ${accent}; }
  .pay .body { margin-top: 4px; white-space: pre-wrap; }
  .notes { margin-top: 16px; color: #475569; }
  .footer { margin-top: 26px; border-top: 2px solid ${accent}; padding-top: 10px; text-align: center; }
  .footer .note { color: #334155; font-size: 12px; }
  .footer .page { color: #94a3b8; font-size: 11px; margin-top: 4px; }
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
          ${d.business.address ? `<div class="muted">${esc(d.business.address)}</div>` : ''}
          ${d.business.phone ? `<div class="muted">${esc(d.business.phone)}</div>` : ''}
          ${d.business.email ? `<div class="muted">${esc(d.business.email)}</div>` : ''}
          ${d.business.taxNumber ? `<div class="muted">${esc(tr('inv.taxNumber'))}: ${esc(d.business.taxNumber)}</div>` : ''}
        </div>
      </div>
      <div class="doc">
        <div class="stamp">${esc(tr(`inv.status.${d.display}`))}</div>
        <div class="inv-word">${esc(tr('inv.invoiceNo'))}</div>
        <div class="inv-no">${esc(d.number)}</div>
        <div class="docline"><span class="k">${esc(tr('inv.date'))}:</span> ${esc(formatDate(d.issueDate))}</div>
        ${d.dueDate ? `<div class="docline"><span class="k">${esc(tr('inv.due'))}:</span> ${esc(formatDate(d.dueDate))}</div>` : ''}
      </div>
    </div>

    <div class="billto">
      <div class="label">${esc(tr('inv.billTo'))}</div>
      <div class="name">${esc(d.client.name) || '—'}</div>
      ${d.client.phone ? `<div class="muted">${esc(d.client.phone)}</div>` : ''}
      ${d.client.address ? `<div class="muted">${esc(d.client.address)}</div>` : ''}
      ${d.client.email ? `<div class="muted">${esc(d.client.email)}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th class="idx">#</th>
          <th>${esc(tr('inv.itemDesc'))}</th>
          <th class="num">${esc(tr('inv.qty'))}</th>
          <th class="num">${esc(tr('inv.unitPrice'))} (${esc(cur)})</th>
          <th class="num">${esc(tr('inv.lineTotal'))} (${esc(cur)})</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">${totalsInner}</div>

    ${d.notes ? `<div class="notes">${esc(d.notes)}</div>` : ''}
    ${
      d.business.paymentInstructions
        ? `<div class="pay"><div class="label">${esc(tr('inv.paymentInstructions'))}</div><div class="body">${esc(d.business.paymentInstructions)}</div></div>`
        : ''
    }

    <div class="footer">
      ${d.business.footer ? `<div class="note">${esc(d.business.footer)}</div>` : ''}
      <div class="page">${esc(interpolate(tr('inv.pageOf'), { n: '1', total: '1' }))}</div>
    </div>
  </div>
</body>
</html>`;
}
