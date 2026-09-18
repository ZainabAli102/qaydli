'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/components/LocaleProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function OnboardingForm() {
  const { t } = useLocale();
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('IQD');
  const [usdRate, setUsdRate] = useState('1310');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.rpc('onboard_business', {
        p_name: name,
        p_city: city,
        p_base_currency: baseCurrency,
        p_usd_rate: Number(usdRate) || 1310,
      });
      if (error) throw error;
      router.replace('/scan');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">{t('onboardingTitle')}</h1>
        <LanguageSwitcher />
      </header>

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t('businessName')}</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t('city')}</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t('baseCurrency')}</span>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base focus:border-brand focus:outline-none"
          >
            <option value="IQD">IQD — Iraqi dinar</option>
            <option value="USD">USD — US dollar</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t('usdRate')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={usdRate}
            onChange={(e) => setUsdRate(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-500">{t('usdRateHint')}</span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
        >
          {busy ? '…' : t('finish')}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
