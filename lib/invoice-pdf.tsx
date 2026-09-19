// Invoice → PDF with @react-pdf/renderer. Browser-free (no Chromium), so it
// runs anywhere including Vercel serverless. Mirrors lib/invoice-html.ts.
//
// Arabic/Kurdish: Noto Naskh Arabic is embedded and shapes cursively. react-pdf
// has a bug where the FIRST cluster of a run loses its dots; prefixing an
// RTL-mark (U+200F) to Arabic-script runs fixes it (verified visually) — see
// rtlText().

import path from 'node:path';
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import { t, dir, interpolate } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { lineTotal, normalizeHex, DEFAULT_ACCENT } from '@/lib/invoices';
import { formatDate, formatAmount, currencyLabel, altCurrency } from '@/lib/invoice-format';
import type { InvoiceHtmlData } from '@/lib/invoice-html';

// ---- fonts (registered once) ----------------------------------------------
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
let registered = false;
function ensureFonts() {
  if (registered) return;
  Font.register({
    family: 'Sans',
    fonts: [
      { src: path.join(FONT_DIR, 'NotoSans-Regular.ttf'), fontWeight: 'normal' },
      { src: path.join(FONT_DIR, 'NotoSans-Bold.ttf'), fontWeight: 'bold' },
    ],
  });
  Font.register({
    family: 'Naskh',
    fonts: [
      { src: path.join(FONT_DIR, 'NotoNaskhArabic-Regular.ttf'), fontWeight: 'normal' },
      { src: path.join(FONT_DIR, 'NotoNaskhArabic-Bold.ttf'), fontWeight: 'bold' },
    ],
  });
  // Shadow the built-in default family so no run ever resolves to pdfkit's
  // standard Helvetica (whose metrics are lazily required and easy to miss in
  // serverless tracing). Every Text also sets a Noto family explicitly below.
  Font.register({
    family: 'Helvetica',
    fonts: [
      { src: path.join(FONT_DIR, 'NotoSans-Regular.ttf'), fontWeight: 'normal' },
      { src: path.join(FONT_DIR, 'NotoSans-Bold.ttf'), fontWeight: 'bold' },
    ],
  });
  // Keep whole words intact (no hyphenation splitting).
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const RLM = '‏';
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
/** Prefix an RTL mark on Arabic-script runs to fix react-pdf's first-dot bug. */
function rtlText(s: string | null | undefined): string {
  const v = String(s ?? '');
  return ARABIC.test(v) ? RLM + v : v;
}

const STATUS_COLOR: Record<string, string> = {
  draft: '#64748b',
  sent: '#0284c7',
  partial: '#d97706',
  paid: '#16a34a',
  overdue: '#dc2626',
};

function InvoiceDoc({ d }: { d: InvoiceHtmlData }) {
  const rtl = dir(d.locale) === 'rtl';
  const accent = normalizeHex(d.accent, DEFAULT_ACCENT);
  const tr = (k: string) => rtlText(t(d.locale, k));
  const cur = currencyLabel(d.currency);
  const money = (n: number) => formatMoney(n, d.currency); // Western digits, LTR
  const amt = (n: number) => formatAmount(n, d.currency);
  const balance = Math.max(0, d.total - d.paid);
  const hasPayment = d.paid > 0;
  const equiv = altCurrency(d.total, d.currency, d.usdIqdRate ?? 0);
  const statusColor = STATUS_COLOR[d.display] ?? '#64748b';
  const align = (rtl ? 'right' : 'left') as 'right' | 'left';
  const numAlign = (rtl ? 'left' : 'right') as 'right' | 'left';
  const rowDir = (rtl ? 'row-reverse' : 'row') as 'row' | 'row-reverse';

  const s = StyleSheet.create({
    page: {
      paddingVertical: 44,
      paddingHorizontal: 40,
      paddingBottom: 56,
      fontFamily: rtl ? 'Naskh' : 'Sans',
      fontSize: 10,
      color: '#0f172a',
    },
    top: { flexDirection: rowDir, justifyContent: 'space-between' },
    brandRow: { flexDirection: rowDir },
    logo: { height: 52, width: 52, maxWidth: 140, objectFit: 'contain', marginHorizontal: 10 },
    bizName: { fontSize: 15, fontWeight: 'bold', color: accent, textAlign: align, marginBottom: 2 },
    muted: { color: '#64748b', fontSize: 9, textAlign: align },
    doc: { textAlign: rtl ? 'left' : 'right', maxWidth: 200 },
    stamp: {
      alignSelf: rtl ? 'flex-start' : 'flex-end',
      borderWidth: 1.5,
      borderColor: statusColor,
      color: statusColor,
      borderRadius: 5,
      fontSize: 9,
      fontWeight: 'bold',
      letterSpacing: 1,
      textTransform: 'uppercase',
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    invWord: { fontSize: 26, fontWeight: 'bold', letterSpacing: 1, marginTop: 8, textTransform: 'uppercase' },
    invNo: { fontSize: 12, fontWeight: 'bold', color: accent, marginBottom: 6 },
    docline: { fontSize: 10, color: '#334155' },
    label: { fontSize: 9, color: '#94a3b8', fontWeight: 'bold', letterSpacing: 0.5, textAlign: align },
    billto: { marginTop: 26, alignItems: rtl ? 'flex-end' : 'flex-start' },
    clientName: { fontWeight: 'bold', fontSize: 12, textAlign: align, marginTop: 2 },
    th: {
      flexDirection: rowDir,
      backgroundColor: accent,
      paddingVertical: 7,
      paddingHorizontal: 6,
    },
    tr: { flexDirection: rowDir, borderBottomWidth: 1, borderBottomColor: '#eef2f7', paddingVertical: 6, paddingHorizontal: 6 },
    trAlt: { backgroundColor: '#f8fafc' },
    hIdx: { width: 20, textAlign: 'center', color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    hDesc: { flexGrow: 1, flexBasis: 0, textAlign: align, color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    hQty: { width: 32, textAlign: numAlign, color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    hNum: { width: 92, textAlign: numAlign, color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    // The '(IQD)' tag is Latin — pin it to the Latin font so it renders
    // regardless of the Arabic font's Latin coverage/subsetting.
    curTag: { fontFamily: 'Sans' },
    cIdx: { width: 20, textAlign: 'center', color: '#94a3b8' },
    cDesc: { flexGrow: 1, flexBasis: 0, textAlign: align, color: '#334155' },
    cQty: { width: 32, textAlign: numAlign },
    cNum: { width: 92, textAlign: numAlign },
    totals: { marginTop: 16, alignSelf: rtl ? 'flex-start' : 'flex-end', width: 260 },
    tline: { flexDirection: rowDir, justifyContent: 'space-between', paddingVertical: 3 },
    tstrong: { borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 4, paddingTop: 7, fontWeight: 'bold' },
    equiv: { textAlign: numAlign, color: '#94a3b8', fontSize: 9, paddingBottom: 2 },
    grand: {
      flexDirection: rowDir,
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingVertical: 9,
      paddingHorizontal: 11,
      borderRadius: 6,
      backgroundColor: accent,
    },
    grandText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    pay: {
      marginTop: 20,
      padding: 11,
      backgroundColor: '#f8fafc',
      borderRadius: 8,
      [rtl ? 'borderRightWidth' : 'borderLeftWidth']: 3,
      [rtl ? 'borderRightColor' : 'borderLeftColor']: accent,
    },
    notes: { marginTop: 14, color: '#475569', textAlign: align },
    footer: {
      position: 'absolute',
      bottom: 28,
      left: 40,
      right: 40,
      borderTopWidth: 2,
      borderTopColor: accent,
      paddingTop: 8,
    },
    footNote: { textAlign: 'center', color: '#334155', fontSize: 9 },
    footPage: { textAlign: 'center', color: '#94a3b8', fontSize: 8, marginTop: 3 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.top}>
          <View style={s.brandRow}>
            {/* react-pdf's Image is a PDF primitive, not an <img>; it has no alt. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {d.business.logoUrl ? <Image style={s.logo} src={d.business.logoUrl} /> : null}
            <View>
              <Text style={s.bizName}>{rtlText(d.business.name)}</Text>
              {d.business.address ? <Text style={s.muted}>{rtlText(d.business.address)}</Text> : null}
              {d.business.phone ? <Text style={s.muted}>{d.business.phone}</Text> : null}
              {d.business.email ? <Text style={s.muted}>{d.business.email}</Text> : null}
              {d.business.taxNumber ? (
                <Text style={s.muted}>
                  {tr('inv.taxNumber')}: {d.business.taxNumber}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={s.doc}>
            <Text style={s.stamp}>{tr(`inv.status.${d.display}`)}</Text>
            <Text style={s.invWord}>{tr('inv.invoiceNo')}</Text>
            <Text style={s.invNo}>{d.number}</Text>
            <Text style={s.docline}>
              <Text style={s.label}>{tr('inv.date')}: </Text>
              {formatDate(d.issueDate)}
            </Text>
            {d.dueDate ? (
              <Text style={s.docline}>
                <Text style={s.label}>{tr('inv.due')}: </Text>
                {formatDate(d.dueDate)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Bill to */}
        <View style={s.billto}>
          <Text style={s.label}>{tr('inv.billTo')}</Text>
          <Text style={s.clientName}>{rtlText(d.client.name) || '—'}</Text>
          {d.client.phone ? <Text style={s.muted}>{d.client.phone}</Text> : null}
          {d.client.address ? <Text style={s.muted}>{rtlText(d.client.address)}</Text> : null}
          {d.client.email ? <Text style={s.muted}>{d.client.email}</Text> : null}
        </View>

        {/* Items */}
        <View style={{ marginTop: 14 }}>
          <View style={s.th}>
            <Text style={s.hIdx}>#</Text>
            <Text style={s.hDesc}>{tr('inv.itemDesc')}</Text>
            <Text style={s.hQty}>{tr('inv.qty')}</Text>
            <Text style={s.hNum}>
              <Text>{tr('inv.unitPrice')}</Text>
              <Text style={s.curTag}> ({cur})</Text>
            </Text>
            <Text style={s.hNum}>
              <Text>{tr('inv.lineTotal')}</Text>
              <Text style={s.curTag}> ({cur})</Text>
            </Text>
          </View>
          {d.items.map((it, i) => (
            <View style={i % 2 === 1 ? [s.tr, s.trAlt] : s.tr} key={i}>
              <Text style={s.cIdx}>{i + 1}</Text>
              <Text style={s.cDesc}>{rtlText(it.description) || '—'}</Text>
              <Text style={s.cQty}>{String(it.qty)}</Text>
              <Text style={s.cNum}>{amt(it.unit_price)}</Text>
              <Text style={s.cNum}>{amt(lineTotal(it))}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={s.totals}>
          <View style={s.tline}>
            <Text style={s.muted}>{tr('inv.subtotal')}</Text>
            <Text>{money(d.subtotal)}</Text>
          </View>
          {d.discount > 0 ? (
            <View style={s.tline}>
              <Text style={s.muted}>{tr('inv.discount')}</Text>
              <Text>− {money(d.discount)}</Text>
            </View>
          ) : null}

          {hasPayment ? (
            <>
              <View style={[s.tline, s.tstrong]}>
                <Text>{tr('inv.total')}</Text>
                <Text>{money(d.total)}</Text>
              </View>
              {equiv ? <Text style={s.equiv}>{equiv}</Text> : null}
              <View style={s.tline}>
                <Text style={s.muted}>{tr('inv.paidToDate')}</Text>
                <Text>{money(d.paid)}</Text>
              </View>
              <View style={s.grand}>
                <Text style={s.grandText}>{tr('inv.balanceDue')}</Text>
                <Text style={s.grandText}>{money(balance)}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={s.grand}>
                <Text style={s.grandText}>{tr('inv.total')}</Text>
                <Text style={s.grandText}>{money(d.total)}</Text>
              </View>
              {equiv ? <Text style={s.equiv}>{equiv}</Text> : null}
            </>
          )}
        </View>

        {d.notes ? <Text style={s.notes}>{rtlText(d.notes)}</Text> : null}
        {d.business.paymentInstructions ? (
          <View style={s.pay}>
            <Text style={s.label}>{tr('inv.paymentInstructions')}</Text>
            <Text style={{ textAlign: align, marginTop: 3 }}>{rtlText(d.business.paymentInstructions)}</Text>
          </View>
        ) : null}

        {/* Footer (fixed to the page bottom): note + Page X of N + accent line */}
        <View style={s.footer} fixed>
          {d.business.footer ? <Text style={s.footNote}>{rtlText(d.business.footer)}</Text> : null}
          <Text
            style={s.footPage}
            render={({ pageNumber, totalPages }) =>
              interpolate(t(d.locale, 'inv.pageOf'), { n: String(pageNumber), total: String(totalPages) })
            }
            fixed
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(d: InvoiceHtmlData): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<InvoiceDoc d={d} />);
}
