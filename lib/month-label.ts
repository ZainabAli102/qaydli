// Localised "August 2026" label for a 'YYYY-MM' month, for the current locale.
const LOCALE_TAG: Record<string, string> = { en: 'en', ar: 'ar-IQ', ckb: 'ckb-IQ' };

export function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? 'en', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return month;
  }
}
