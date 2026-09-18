// Tolerant normalisation of raw model output into a ReceiptResult. Models drift
// (a bare value instead of {value,confidence}, "850,000" instead of 850000,
// "usd" instead of "USD"), so we coerce defensively rather than reject.

import { z } from 'zod';
import type {
  Confident,
  Currency,
  DocumentType,
  Flag,
  LineItem,
  ReceiptResult,
} from './types';

const DOC_TYPES: DocumentType[] = [
  'invoice',
  'receipt',
  'payment_receipt',
  'voucher',
  'unknown',
];

/** Convert Arabic-Indic and Persian/Kurdish numerals to Western digits. */
export function normalizeDigits(input: string): string {
  const map: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  };
  return input.replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}

/** Coerce a model number-ish value (number, or "15,000", or "٨٠٠") to number|null. */
export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = normalizeDigits(v).replace(/[,\s]/g, '').replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clampConfidence(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/** Accept {value,confidence} or a bare value; return a normalised Confident. */
function confident<T>(raw: unknown, coerce: (v: unknown) => T, fallbackConf = 0.5): Confident<T> {
  if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
    const o = raw as Record<string, unknown>;
    return { value: coerce(o.value), confidence: clampConfidence(o.confidence ?? fallbackConf) };
  }
  return { value: coerce(raw), confidence: raw == null ? 0 : fallbackConf };
}

const asString = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || s.toLowerCase() === 'null' ? null : s;
};

function asCurrency(v: unknown): Currency {
  const s = String(v ?? '').toUpperCase().trim();
  if (s === 'USD' || s === '$') return 'USD';
  if (s === 'MIXED') return 'mixed';
  return 'IQD';
}

function asCurrencyOrNull(v: unknown): Currency | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).toUpperCase().trim();
  if (s === 'NULL') return null;
  if (s === 'USD' || s === '$') return 'USD';
  if (s === 'MIXED') return 'mixed';
  if (s === 'IQD') return 'IQD';
  return null;
}

function asDocType(v: unknown): DocumentType {
  const s = String(v ?? '').toLowerCase().trim();
  return (DOC_TYPES as string[]).includes(s) ? (s as DocumentType) : 'unknown';
}

/** ISO date passthrough with a light validity check; otherwise null. */
function asIsoDate(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// Loose zod gate: we only require an object; field-level coercion happens below.
const rawObject = z.record(z.any());

function normalizeLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    return {
      description: asString(o.description),
      qty: toNumber(o.qty),
      unit_price: toNumber(o.unit_price),
      line_total: toNumber(o.line_total),
      confidence: clampConfidence(o.confidence ?? 0.5),
    };
  });
}

function normalizeFlags(raw: unknown): Flag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      const code = asString(o.code);
      if (!code) return null;
      const sev = String(o.severity ?? 'warn');
      return {
        code,
        message: asString(o.message) ?? code,
        severity: (['info', 'warn', 'error'].includes(sev) ? sev : 'warn') as Flag['severity'],
      };
    })
    .filter((f): f is Flag => f !== null);
}

/** Parse arbitrary model JSON into a fully-formed ReceiptResult. */
export function parseReceiptResult(input: unknown): ReceiptResult {
  const o = rawObject.parse(input);
  return {
    document_type: confident(o.document_type, asDocType, 0.6),
    vendor: confident(o.vendor, asString),
    vendor_latin: confident(o.vendor_latin, asString),
    vendor_phone: confident(o.vendor_phone, asString),
    invoice_number: confident(o.invoice_number, asString),
    date: confident(o.date, asIsoDate),
    currency: confident(o.currency, asCurrency, 0.6),
    line_items: normalizeLineItems(o.line_items),
    subtotal: confident(o.subtotal, toNumber),
    discount: confident(o.discount, toNumber),
    total: confident(o.total, toNumber),
    paid_amount: confident(o.paid_amount, toNumber),
    paid_currency: confident(o.paid_currency, asCurrencyOrNull),
    remaining: confident(o.remaining, toNumber),
    payment_method: confident(o.payment_method, asString),
    language: confident(o.language, asString),
    notes: confident(o.notes, asString),
    flags: normalizeFlags(o.flags),
  };
}
