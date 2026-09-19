'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';

// Fetches the model-generated 3-sentence summary (numbers only, cached server-
// side). Shows a friendly locked state when there are fewer than 5 entries.
export function SummaryCard({ month, signatureKey }: { month: string; signatureKey: string }) {
  const { t, locale } = useLocale();
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'locked'; count: number } | { kind: 'text'; text: string } | { kind: 'error' }
  >({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    fetch(`/api/insights/summary?m=${month}&lang=${locale}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.locked) setState({ kind: 'locked', count: d.count ?? 0 });
        else if (typeof d.summary === 'string') setState({ kind: 'text', text: d.summary });
        else setState({ kind: 'error' });
      })
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
    // signatureKey changes when the month's transactions change → refetch.
  }, [month, locale, signatureKey]);

  if (state.kind === 'locked') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
        <div className="mb-1 text-2xl" aria-hidden>
          🌱
        </div>
        <p className="text-sm text-amber-800">{t('ins.locked')}</p>
        <p className="mt-1 text-xs text-amber-600">
          {state.count} {t('ins.lockedCount')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('ins.summary')}</h2>
      {state.kind === 'loading' ? (
        <p className="text-sm text-slate-400">{t('loading')}</p>
      ) : state.kind === 'text' ? (
        <p className="text-sm leading-relaxed text-slate-700">{state.text}</p>
      ) : (
        <p className="text-sm text-slate-400">—</p>
      )}
    </div>
  );
}
