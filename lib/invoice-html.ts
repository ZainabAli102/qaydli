// Pure invoice → HTML. Feeds the public page and the Settings live preview
// (the PDF is rendered separately by lib/invoice-pdf.tsx to the same grid).
// RTL-correct for Arabic/Kurdish via dir on <html> + logical CSS (start/end);
// Western digits throughout. Google Fonts (Noto) so Arabic/Kurdish shape.

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
  /** Accent colour for header rule, table header and the amount bar. */
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

const MIN_ROWS = 6;

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

  const metaRow = (label: string, value: string, valueClass = 'mval') =>
    `<div class="mrow"><span class="mlabel">${esc(label)}</span><span class="${valueClass}">${esc(value)}</span></div>`;

  const itemRows = d.items
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
  const padCount = Math.max(0, MIN_ROWS - d.items.length);
  const padRows = Array.from({ length: padCount })
    .map(() => `<tr class="pad"><td class="idx">&nbsp;</td><td></td><td></td><td></td><td></td></tr>`)
    .join('');

  const tline = (label: string, value: string, cls = '') =>
    `<div class="tline ${cls}"><span class="tlabel">${esc(label)}</span><span>${esc(value)}</span></div>`;
  const grand = (label: string, value: string) =>
    `<div class="grand"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;

  const totalsInner = hasPayment
    ? `
      ${tline(tr('inv.subtotal'), money(d.subtotal))}
      ${d.discount > 0 ? tline(tr('inv.discount'), `− ${money(d.discount)}`) : ''}
      ${tline(tr('inv.total'), money(d.total), 'strong')}
      ${tline(tr('inv.paidToDate'), money(d.paid))}
      ${grand(tr('inv.balanceDue'), money(balance))}
      ${equiv ? `<div class="equiv">${esc(equiv)}</div>` : ''}`
    : `
      ${tline(tr('inv.subtotal'), money(d.subtotal))}
      ${d.discount > 0 ? tline(tr('inv.discount'), `− ${money(d.discount)}`) : ''}
      ${grand(tr('inv.total'), money(d.total))}
      ${equiv ? `<div class="equiv">${esc(equiv)}</div>` : ''}`;

  const sideBox = d.business.paymentInstructions
    ? `<div class="sidebox"><div class="mlabel">${esc(tr('inv.paymentInstructions'))}</div><div class="sidebody">${esc(d.business.paymentInstructions)}</div></div>`
    : d.notes
      ? `<div class="sidebox"><div class="mlabel">${esc(tr('inv.notes'))}</div><div class="sidebody">${esc(d.notes)}</div></div>`
      : `<div class="sidebox blank"></div>`;

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
  :root { --accent: ${accent}; --status: ${statusColor}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f1f5f9; }
  body {
    font-family: 'Noto Sans', 'Noto Naskh Arabic', system-ui, -apple-system, sans-serif;
    color: #0f172a; font-size: 12.5px; line-height: 1.5;
  }
  .sheet {
    max-width: 780px; min-height: 1080px; margin: 16px auto; background: #fff;
    padding: 32px 36px 24px; display: flex; flex-direction: column;
    box-shadow: 0 1px 6px rgba(15,23,42,.08);
  }
  .mlabel { font-size: 10px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
  .muted { color: #64748b; font-size: 11px; margin-top: 1px; }

  /* 1. Header band (fixed height) */
  .header { min-height: 150px; display: flex; justify-content: space-between; gap: 24px; }
  .brand { flex: 1 1 0; min-width: 0; }
  .logo { max-height: 48px; max-width: 150px; object-fit: contain; display: block; margin-bottom: 8px; }
  .biz-name { font-size: 17px; font-weight: 700; color: var(--accent); margin-bottom: 2px; }
  .doc { width: 240px; }
  .inv-word { font-size: 28px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; text-align: end; margin-bottom: 8px; }
  .meta { }
  .mrow { display: flex; justify-content: space-between; gap: 10px; margin-top: 3px; }
  .mrow .mval { font-size: 12.5px; text-align: end; }
  .mrow .mstatus { font-size: 12.5px; font-weight: 700; text-transform: uppercase; color: var(--status); text-align: end; }
  /* Keep numbers/dates/amounts reading LTR even inside an RTL page. */
  .mrow .mval, .tline > span:last-child, .grand > span:last-child, .equiv, td.num { unicode-bidi: plaintext; }

  /* 2. Accent rule */
  .rule { height: 2px; background: var(--accent); margin: 8px 0 16px; }

  /* 3. Parties */
  .parties { min-height: 92px; display: flex; gap: 24px; }
  .party { flex: 1 1 0; min-width: 0; }
  .party .name { font-weight: 700; font-size: 13px; margin: 3px 0 1px; }

  /* 4. Items */
  table { width: 100%; border-collapse: collapse; }
  thead th { background: var(--accent); color: #fff; font-size: 10px; font-weight: 700; padding: 7px 8px; text-align: start; }
  thead th.idx { width: 26px; text-align: center; }
  thead th.num { text-align: end; white-space: nowrap; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #eef2f7; height: 20px; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td.idx { width: 26px; text-align: center; color: #94a3b8; }
  td.num { text-align: end; white-space: nowrap; }
  td.desc { color: #334155; }

  /* 5+6. Lower row: side box | totals */
  .lower { display: flex; gap: 16px; align-items: flex-start; margin-top: 24px; }
  .sidebox { flex: 1 1 0; min-width: 0; padding: 12px 14px; background: #f8fafc; border-radius: 8px; border-inline-start: 3px solid var(--accent); }
  .sidebox.blank { background: transparent; border: 0; }
  .sidebody { margin-top: 4px; color: #475569; white-space: pre-wrap; }
  .totals { width: 40%; max-width: 300px; }
  .tline { display: flex; justify-content: space-between; padding: 4px 2px; }
  .tline .tlabel { color: #64748b; }
  .tline.strong { font-weight: 700; border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 8px; }
  .tline.strong .tlabel { color: inherit; }
  .grand { display: flex; justify-content: space-between; align-items: center; background: var(--accent); color: #fff; margin-top: 8px; padding: 10px 12px; border-radius: 8px; font-size: 15px; font-weight: 700; }
  .equiv { text-align: end; color: #94a3b8; font-size: 11px; margin-top: 6px; }

  /* 7. Footer */
  .footer { margin-top: auto; border-top: 2px solid var(--accent); padding-top: 8px; display: flex; justify-content: space-between; gap: 12px; }
  .footer .note { color: #334155; font-size: 11px; }
  .footer .page { color: #94a3b8; font-size: 10px; white-space: nowrap; }

  @media print {
    html, body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; max-width: none; min-height: 100vh; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <!-- 1. Header band -->
    <div class="header">
      <div class="brand">
        ${d.business.logoUrl ? `<img class="logo" src="${esc(d.business.logoUrl)}" alt="">` : ''}
        <div class="biz-name">${esc(d.business.name)}</div>
        ${d.business.address ? `<div class="muted">${esc(d.business.address)}</div>` : ''}
        ${d.business.phone ? `<div class="muted">${esc(d.business.phone)}</div>` : ''}
        ${d.business.email ? `<div class="muted">${esc(d.business.email)}</div>` : ''}
        ${d.business.taxNumber ? `<div class="muted">${esc(tr('inv.taxNumber'))}: ${esc(d.business.taxNumber)}</div>` : ''}
      </div>
      <div class="doc">
        <div class="inv-word">${esc(tr('inv.invoiceNo'))}</div>
        <div class="meta">
          ${metaRow(tr('inv.numberLabel'), d.number)}
          ${metaRow(tr('inv.date'), formatDate(d.issueDate))}
          ${d.dueDate ? metaRow(tr('inv.due'), formatDate(d.dueDate)) : ''}
          ${metaRow(tr('inv.statusLabel'), tr(`inv.status.${d.display}`), 'mstatus')}
        </div>
      </div>
    </div>

    <!-- 2. Accent rule -->
    <div class="rule"></div>

    <!-- 3. Parties -->
    <div class="parties">
      <div class="party">
        <div class="mlabel">${esc(tr('inv.from'))}</div>
        <div class="name">${esc(d.business.name)}</div>
        ${d.business.address ? `<div class="muted">${esc(d.business.address)}</div>` : ''}
        ${d.business.phone ? `<div class="muted">${esc(d.business.phone)}</div>` : ''}
      </div>
      <div class="party">
        <div class="mlabel">${esc(tr('inv.billTo'))}</div>
        <div class="name">${esc(d.client.name) || '—'}</div>
        ${d.client.phone ? `<div class="muted">${esc(d.client.phone)}</div>` : ''}
        ${d.client.address ? `<div class="muted">${esc(d.client.address)}</div>` : ''}
        ${d.client.email ? `<div class="muted">${esc(d.client.email)}</div>` : ''}
      </div>
    </div>

    <!-- 4. Items -->
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
      <tbody>${itemRows}${padRows}</tbody>
    </table>

    <!-- 5+6. Side box | totals -->
    <div class="lower">
      ${sideBox}
      <div class="totals">${totalsInner}</div>
    </div>

    <!-- 7. Footer -->
    <div class="footer">
      <div class="note">${d.business.footer ? esc(d.business.footer) : ''}</div>
      <div class="page">${esc(interpolate(tr('inv.pageOf'), { n: '1', total: '1' }))}</div>
    </div>
  </div>
</body>
</html>`;
}
