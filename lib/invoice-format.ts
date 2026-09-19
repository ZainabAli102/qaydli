// Shared, pure formatting for the invoice PDF and public page. Digits stay
// Western (Latin) even on Arabic/Kurdish invoices, per the standard layout.

import { formatUsd, type Currency } from '@/lib/money';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → '19 Sep 2026' (Western digits, English month, all locales). */
export function formatDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] ?? mo} ${y}`;
}

/** A bare number with thousands separators (no currency symbol). IQD is whole;
 *  USD keeps two decimals. */
export function formatAmount(n: number, currency: Currency): string {
  if (currency === 'USD') {
    return (Math.round(n * 100) / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return Math.round(n).toLocaleString('en-US');
}

/** The currency code shown once in the table header, e.g. "IQD". */
export function currencyLabel(currency: Currency): string {
  return currency;
}

/**
 * Small equivalent line under the total: for an IQD invoice the USD value, and
 * for a USD invoice the IQD value. null when the rate is unusable.
 */
export function altCurrency(total: number, currency: Currency, rate: number): string | null {
  if (!rate || rate <= 0) return null;
  // '~' (ASCII) renders reliably in every embedded font, unlike '≈'.
  if (currency === 'IQD') return `~ ${formatUsd(total / rate)}`;
  return `~ ${Math.round(total * rate).toLocaleString('en-US')} IQD`;
}
