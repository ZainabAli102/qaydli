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

// Strict-grid geometry (points). A4 content width = 595.28 − 2*40 ≈ 515.
const MARGIN = 40;
const CONTENT_W = 595.28 - MARGIN * 2;
const HEADER_H = 150; // fixed → items table always starts at the same y
const PARTIES_H = 96; // fixed
const ROW_H = 22;
const MIN_ROWS = 6;
const TOTALS_W = Math.round(CONTENT_W * 0.4);
const META_LABEL_W = 82;

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
  const padRows = Math.max(0, MIN_ROWS - d.items.length);

  const s = StyleSheet.create({
    page: {
      paddingTop: 24,
      paddingHorizontal: MARGIN,
      paddingBottom: 40,
      fontFamily: rtl ? 'Naskh' : 'Sans',
      fontSize: 10,
      color: '#0f172a',
    },
    // --- header band ---
    header: { height: HEADER_H, flexDirection: rowDir, justifyContent: 'space-between' },
    brand: { flexGrow: 1, flexBasis: 0, paddingRight: rtl ? 0 : 16, paddingLeft: rtl ? 16 : 0 },
    logo: { height: 48, maxWidth: 150, objectFit: 'contain', marginBottom: 8, alignSelf: rtl ? 'flex-end' : 'flex-start' },
    bizName: { fontSize: 15, fontWeight: 'bold', color: accent, textAlign: align, marginBottom: 2 },
    muted: { color: '#64748b', fontSize: 9, textAlign: align, marginTop: 1 },
    docCol: { width: 220 },
    invWord: { fontSize: 28, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase', textAlign: numAlign, marginBottom: 8 },
    metaRow: { flexDirection: rowDir, marginTop: 3 },
    metaLabel: { width: META_LABEL_W, color: '#94a3b8', fontSize: 8.5, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.4, textAlign: align },
    metaValue: { flexGrow: 1, flexBasis: 0, fontSize: 10, textAlign: numAlign },
    metaStatus: { flexGrow: 1, flexBasis: 0, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: statusColor, textAlign: numAlign },
    rule: { height: 2, backgroundColor: accent, marginTop: 8, marginBottom: 16 },
    // --- parties ---
    parties: { height: PARTIES_H, flexDirection: rowDir },
    party: { flexGrow: 1, flexBasis: 0 },
    partyGap: { width: 24 },
    label: { fontSize: 8.5, color: '#94a3b8', fontWeight: 'bold', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: align },
    partyName: { fontWeight: 'bold', fontSize: 11, textAlign: align, marginTop: 3, marginBottom: 1 },
    // --- items ---
    th: { flexDirection: rowDir, backgroundColor: accent, paddingVertical: 6, paddingHorizontal: 6 },
    tr: { flexDirection: rowDir, minHeight: ROW_H, borderBottomWidth: 1, borderBottomColor: '#eef2f7', paddingVertical: 5, paddingHorizontal: 6 },
    trAlt: { backgroundColor: '#f8fafc' },
    hIdx: { width: 20, textAlign: 'center', color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    hDesc: { flexGrow: 1, flexBasis: 0, textAlign: align, color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    hQty: { width: 34, textAlign: numAlign, color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    hNum: { width: 96, textAlign: numAlign, color: '#fff', fontWeight: 'bold', fontSize: 8.5 },
    // The '(IQD)' tag is Latin — pin it to the Latin font so it renders
    // regardless of the Arabic font's Latin coverage/subsetting.
    curTag: { fontFamily: 'Sans' },
    cIdx: { width: 20, textAlign: 'center', color: '#94a3b8' },
    cDesc: { flexGrow: 1, flexBasis: 0, textAlign: align, color: '#334155' },
    cQty: { width: 34, textAlign: numAlign },
    cNum: { width: 96, textAlign: numAlign },
    // --- totals + side box ---
    lower: { flexDirection: rowDir, marginTop: 24, alignItems: 'flex-start' },
    sideBox: {
      flexGrow: 1,
      flexBasis: 0,
      marginRight: rtl ? 0 : 16,
      marginLeft: rtl ? 16 : 0,
      padding: 12,
      backgroundColor: '#f8fafc',
      borderRadius: 8,
      [rtl ? 'borderRightWidth' : 'borderLeftWidth']: 3,
      [rtl ? 'borderRightColor' : 'borderLeftColor']: accent,
    },
    sideBody: { textAlign: align, marginTop: 4, color: '#475569' },
    totals: { width: TOTALS_W },
    tline: { flexDirection: rowDir, justifyContent: 'space-between', paddingVertical: 3 },
    tstrong: { borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 4, paddingTop: 7, fontWeight: 'bold' },
    grand: {
      flexDirection: rowDir,
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 11,
      borderRadius: 6,
      backgroundColor: accent,
    },
    grandText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    equiv: { textAlign: numAlign, color: '#94a3b8', fontSize: 9, marginTop: 6 },
    // --- footer ---
    spacer: { flexGrow: 1 },
    footer: { borderTopWidth: 2, borderTopColor: accent, paddingTop: 8, flexDirection: rowDir, justifyContent: 'space-between' },
    footNote: { color: '#334155', fontSize: 9, flexShrink: 1 },
    footPage: { color: '#94a3b8', fontSize: 8.5 },
  });

  const metaRow = (label: string, valueNode: React.ReactNode) => (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{tr(label)}</Text>
      {valueNode}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* 1. Header band (fixed height): brand | INVOICE + meta table */}
        <View style={s.header}>
          <View style={s.brand}>
            {/* react-pdf's Image is a PDF primitive, not an <img>; it has no alt. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {d.business.logoUrl ? <Image style={s.logo} src={d.business.logoUrl} /> : null}
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
          <View style={s.docCol}>
            <Text style={s.invWord}>{tr('inv.invoiceNo')}</Text>
            {metaRow('inv.numberLabel', <Text style={s.metaValue}>{d.number}</Text>)}
            {metaRow('inv.date', <Text style={s.metaValue}>{formatDate(d.issueDate)}</Text>)}
            {d.dueDate ? metaRow('inv.due', <Text style={s.metaValue}>{formatDate(d.dueDate)}</Text>) : null}
            {metaRow('inv.statusLabel', <Text style={s.metaStatus}>{tr(`inv.status.${d.display}`)}</Text>)}
          </View>
        </View>

        {/* 2. Accent rule */}
        <View style={s.rule} />

        {/* 3. Parties: From | Bill to (equal columns, same top alignment) */}
        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>{tr('inv.from')}</Text>
            <Text style={s.partyName}>{rtlText(d.business.name)}</Text>
            {d.business.address ? <Text style={s.muted}>{rtlText(d.business.address)}</Text> : null}
            {d.business.phone ? <Text style={s.muted}>{d.business.phone}</Text> : null}
          </View>
          <View style={s.partyGap} />
          <View style={s.party}>
            <Text style={s.label}>{tr('inv.billTo')}</Text>
            <Text style={s.partyName}>{rtlText(d.client.name) || '—'}</Text>
            {d.client.phone ? <Text style={s.muted}>{d.client.phone}</Text> : null}
            {d.client.address ? <Text style={s.muted}>{rtlText(d.client.address)}</Text> : null}
            {d.client.email ? <Text style={s.muted}>{d.client.email}</Text> : null}
          </View>
        </View>

        {/* 4. Items table (starts at a fixed y; min 6 rows, padded with zebra) */}
        <View>
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
          {Array.from({ length: padRows }).map((_, k) => {
            const i = d.items.length + k;
            return (
              <View style={i % 2 === 1 ? [s.tr, s.trAlt] : s.tr} key={`pad-${k}`}>
                <Text style={s.cIdx}> </Text>
              </View>
            );
          })}
        </View>

        {/* 5+6. Side box (payment / notes) | totals — same row, balanced */}
        <View style={s.lower}>
          <View style={s.sideBox}>
            {d.business.paymentInstructions ? (
              <>
                <Text style={s.label}>{tr('inv.paymentInstructions')}</Text>
                <Text style={s.sideBody}>{rtlText(d.business.paymentInstructions)}</Text>
              </>
            ) : d.notes ? (
              <>
                <Text style={s.label}>{tr('inv.notes')}</Text>
                <Text style={s.sideBody}>{rtlText(d.notes)}</Text>
              </>
            ) : null}
          </View>
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
              <View style={s.grand}>
                <Text style={s.grandText}>{tr('inv.total')}</Text>
                <Text style={s.grandText}>{money(d.total)}</Text>
              </View>
            )}
            {equiv ? <Text style={s.equiv}>{equiv}</Text> : null}
          </View>
        </View>

        {/* 7. Footer pinned to the bottom: note | page, accent line above */}
        <View style={s.spacer} />
        <View style={s.footer}>
          <Text style={s.footNote}>{d.business.footer ? rtlText(d.business.footer) : ' '}</Text>
          <Text
            style={s.footPage}
            render={({ pageNumber, totalPages }) =>
              interpolate(t(d.locale, 'inv.pageOf'), { n: String(pageNumber), total: String(totalPages) })
            }
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
