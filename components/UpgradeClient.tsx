'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sprout } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function UpgradeClient() {
  const { t } = useLocale();
  const [noted, setNoted] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand">{t('appName')}</h1>
        <LanguageSwitcher />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-4 flex justify-center text-brand" aria-hidden>
          <Sprout size={56} />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-slate-800">{t('upgrade.title')}</h2>
        <p className="mb-6 text-slate-600">{t('upgrade.body')}</p>

        {noted ? (
          <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-green-700">{t('upgrade.noted')}</p>
        ) : (
          <button
            onClick={() => setNoted(true)}
            className="mb-3 w-full rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white"
          >
            {t('upgrade.cta')}
          </button>
        )}
        <Link
          href="/dashboard"
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base font-medium text-slate-700"
        >
          {t('upgrade.viewBooks')}
        </Link>
      </div>
    </main>
  );
}
