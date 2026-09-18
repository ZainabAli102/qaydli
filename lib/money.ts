// Money helpers. The books are kept in INTEGER IQD; USD is shown alongside at
// the business's rate. Amounts entered/extracted in USD are converted to IQD on
// save; the original amount and currency are always kept too.

export type Currency = 'IQD' | 'USD';

/** Convert an amount in `currency` to an integer number of IQD. */
export function toIqd(amount: number, currency: Currency, usdIqdRate: number): number {
  if (!Number.isFinite(amount)) return 0;
  const iqd = currency === 'USD' ? amount * usdIqdRate : amount;
  return Math.round(iqd);
}

/** Convert integer IQD to `currency` (USD is not rounded to integers). */
export function fromIqd(iqd: number, currency: Currency, usdIqdRate: number): number {
  if (currency === 'USD') return usdIqdRate ? iqd / usdIqdRate : 0;
  return Math.round(iqd);
}

/** "1,310,000 IQD" — grouped, no decimals. */
export function formatIqd(iqd: number): string {
  return `${Math.round(iqd).toLocaleString('en-US')} IQD`;
}

/** "$1,000" — USD with up to 2 decimals, trimmed. */
export function formatUsd(usd: number): string {
  const rounded = Math.round(usd * 100) / 100;
  return `$${rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** IQD with its USD equivalent alongside: "1,310,000 IQD (~$1,000)". */
export function iqdWithUsd(iqd: number, usdIqdRate: number): string {
  const usd = fromIqd(iqd, 'USD', usdIqdRate);
  return `${formatIqd(iqd)} (~${formatUsd(usd)})`;
}
