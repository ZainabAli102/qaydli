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
import { t, dir } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { lineTotal, normalizeHex, DEFAULT_ACCENT } from '@/lib/invoices';
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
  const money = (n: number) => formatMoney(n, d.currency); // Latin digits, LTR
  const balance = Math.max(0, d.total - d.paid);
  const partiallyPaid = d.paid > 0 && balance > 0;
  const align = (rtl ? 'right' : 'left') as 'right' | 'left';
  const rowDir = (rtl ? 'row-reverse' : 'row') as 'row' | 'row-reverse';

  const s = StyleSheet.create({
    page: {
      paddingVertical: 40,
      paddingHorizontal: 36,
      fontFamily: rtl ? 'Naskh' : 'Sans',
      fontSize: 10,
      color: '#0f172a',
    },
    top: { flexDirection: rowDir, justifyContent: 'space-between' },
    brandRow: { flexDirection: rowDir, alignItems: 'center' },
    logo: { height: 46, width: 46, objectFit: 'contain', marginHorizontal: 8 },
    bizName: { fontSize: 16, fontWeight: 'bold', color: accent, textAlign: align },
    muted: { color: '#64748b', fontSize: 9, textAlign: align },
    doc: { textAlign: rtl ? 'left' : 'right', maxWidth: 200 },
    label: { fontSize: 8, color: '#94a3b8', fontWeight: 'bold' },
    number: { fontSize: 18, fontWeight: 'bold' },
    badge: {
      marginTop: 4,
      alignSelf: rtl ? 'flex-start' : 'flex-end',
      color: '#fff',
      fontSize: 8,
      fontWeight: 'bold',
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: STATUS_COLOR[d.display] ?? '#64748b',
    },
    parties: { flexDirection: rowDir, justifyContent: 'space-between', marginTop: 22 },
    th: {
      flexDirection: rowDir,
      borderBottomWidth: 2,
      borderBottomColor: accent,
      paddingVertical: 6,
    },
    tr: { flexDirection: rowDir, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 6 },
    cDesc: { flexGrow: 1, flexBasis: 0, textAlign: align, color: accent, fontWeight: 'bold' },
    cDescRow: { flexGrow: 1, flexBasis: 0, textAlign: align, color: '#334155' },
    cNum: { width: 70, textAlign: rtl ? 'left' : 'right' },
    cNumH: { width: 70, textAlign: rtl ? 'left' : 'right', color: accent, fontWeight: 'bold', fontSize: 8 },
    cQty: { width: 36, textAlign: rtl ? 'left' : 'right' },
    cQtyH: { width: 36, textAlign: rtl ? 'left' : 'right', color: accent, fontWeight: 'bold', fontSize: 8 },
    totals: { marginTop: 14, alignSelf: rtl ? 'flex-start' : 'flex-end', width: 240 },
    tline: { flexDirection: rowDir, justifyContent: 'space-between', paddingVertical: 3 },
    grand: {
      flexDirection: rowDir,
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: accent,
    },
    grandText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    balance: { color: '#dc2626', fontWeight: 'bold' },
    pay: {
      marginTop: 20,
      padding: 10,
      backgroundColor: '#f8fafc',
      borderRadius: 8,
      [rtl ? 'borderRightWidth' : 'borderLeftWidth']: 3,
      [rtl ? 'borderRightColor' : 'borderLeftColor']: accent,
    },
    notes: { marginTop: 14, color: '#475569', textAlign: align },
    footNote: { marginTop: 22, textAlign: 'center', color: '#334155' },
    foot: { marginTop: 10, textAlign: 'center', color: '#94a3b8', fontSize: 8 },
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
              {d.business.phone ? <Text style={s.muted}>{d.business.phone}</Text> : null}
              {d.business.email ? <Text style={s.muted}>{d.business.email}</Text> : null}
              {d.business.address ? <Text style={s.muted}>{rtlText(d.business.address)}</Text> : null}
              {d.business.taxNumber ? (
                <Text style={s.muted}>
                  {tr('inv.taxNumber')}: {d.business.taxNumber}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={s.doc}>
            <Text style={s.label}>{tr('inv.invoiceNo')}</Text>
            <Text style={s.number}>{d.number}</Text>
            <Text style={s.badge}>{tr(`inv.status.${d.display}`)}</Text>
          </View>
        </View>

        {/* Bill to + dates */}
        <View style={s.parties}>
          <View style={{ flexGrow: 1 }}>
            <Text style={s.label}>{tr('inv.billTo')}</Text>
            <Text style={{ fontWeight: 'bold', textAlign: align }}>{rtlText(d.client.name) || '—'}</Text>
            {d.client.phone ? <Text style={s.muted}>{d.client.phone}</Text> : null}
            {d.client.email ? <Text style={s.muted}>{d.client.email}</Text> : null}
          </View>
          <View style={{ textAlign: rtl ? 'left' : 'right' }}>
            <Text>
              <Text style={s.label}>{tr('inv.date')}: </Text>
              {d.issueDate}
            </Text>
            {d.dueDate ? (
              <Text>
                <Text style={s.label}>{tr('inv.due')}: </Text>
                {d.dueDate}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Items */}
        <View style={{ marginTop: 12 }}>
          <View style={s.th}>
            <Text style={s.cDesc}>{tr('inv.itemDesc')}</Text>
            <Text style={s.cQtyH}>{tr('inv.qty')}</Text>
            <Text style={s.cNumH}>{tr('inv.unitPrice')}</Text>
            <Text style={s.cNumH}>{tr('inv.lineTotal')}</Text>
          </View>
          {d.items.map((it, i) => (
            <View style={s.tr} key={i}>
              <Text style={s.cDescRow}>{rtlText(it.description) || '—'}</Text>
              <Text style={s.cQty}>{String(it.qty)}</Text>
              <Text style={s.cNum}>{money(it.unit_price)}</Text>
              <Text style={s.cNum}>{money(lineTotal(it))}</Text>
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
          <View style={s.grand}>
            <Text style={s.grandText}>{tr('inv.total')}</Text>
            <Text style={s.grandText}>{money(d.total)}</Text>
          </View>
          {partiallyPaid ? (
            <>
              <View style={s.tline}>
                <Text style={s.muted}>{tr('inv.paidSoFar')}</Text>
                <Text>{money(d.paid)}</Text>
              </View>
              <View style={s.tline}>
                <Text style={s.balance}>{tr('inv.balanceDue')}</Text>
                <Text style={s.balance}>{money(balance)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {d.notes ? <Text style={s.notes}>{rtlText(d.notes)}</Text> : null}
        {d.business.paymentInstructions ? (
          <View style={s.pay}>
            <Text style={s.label}>{tr('inv.paymentInstructions')}</Text>
            <Text style={{ textAlign: align }}>{rtlText(d.business.paymentInstructions)}</Text>
          </View>
        ) : null}

        {d.business.footer ? <Text style={s.footNote}>{rtlText(d.business.footer)}</Text> : null}
        <Text style={s.foot}>
          {tr('inv.publicIntro')} {rtlText(d.business.name)}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(d: InvoiceHtmlData): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<InvoiceDoc d={d} />);
}
