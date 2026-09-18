'use client';

import { useLocale } from '@/components/LocaleProvider';
import { locales, localeNames, isLocale } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => {
        if (isLocale(e.target.value)) setLocale(e.target.value);
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {localeNames[l]}
        </option>
      ))}
    </select>
  );
}
