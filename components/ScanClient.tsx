'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { compressImage } from '@/lib/image-client';

type Stage = 'idle' | 'reading' | 'checking' | 'categorizing' | 'error';

export function ScanClient({
  businessName,
  demoImageUrl,
}: {
  businessName: string;
  demoImageUrl?: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const isDemo = search.get('demo') === '1';

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // In demo mode, preload the bundled sample receipt.
  useEffect(() => {
    if (!isDemo || !demoImageUrl) return;
    (async () => {
      try {
        const res = await fetch(demoImageUrl);
        const blob = await res.blob();
        const img = await compressImage(blob);
        setDataUrl(img.dataUrl);
        setBase64(img.base64);
      } catch {
        /* ignore demo preload errors */
      }
    })();
  }, [isDemo, demoImageUrl]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    try {
      const img = await compressImage(f);
      setDataUrl(img.dataUrl);
      setBase64(img.base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function scan() {
    if (!base64) return;
    setError(null);
    // Staged progress while the request is in flight.
    setStage('reading');
    const timers = [
      setTimeout(() => setStage('checking'), 2500),
      setTimeout(() => setStage('categorizing'), 5000),
    ];
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      timers.forEach(clearTimeout);
      router.push(`/review/${data.document_id}${isDemo ? '?demo=1' : ''}`);
    } catch (err) {
      timers.forEach(clearTimeout);
      setStage('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const busy = stage === 'reading' || stage === 'checking' || stage === 'categorizing';

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand">{t('scanTitle')}</h1>
          <p className="text-sm text-slate-500">{businessName}</p>
        </div>
        <LanguageSwitcher />
      </header>

      {isDemo && (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="me-1 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold">
            {t('demo.badge')}
          </span>
          {t('demo.hint')}
        </div>
      )}

      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="receipt" className="mb-4 max-h-80 w-full rounded-lg object-contain" />
      ) : (
        <div className="mb-4 grid gap-3">
          <button
            onClick={() => cameraRef.current?.click()}
            className="rounded-lg bg-brand px-4 py-4 text-base font-semibold text-white"
          >
            📷 {t('takePhoto')}
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-4 text-base font-semibold text-slate-700"
          >
            🖼️ {t('fromGallery')}
          </button>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onPick} />

      {dataUrl && !busy && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {
              setDataUrl(null);
              setBase64(null);
              setStage('idle');
            }}
            className="rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700"
          >
            {t('retake')}
          </button>
          <button onClick={scan} className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">
            {t('scan')}
          </button>
        </div>
      )}

      {busy && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <ProgressStep active label={t('scan.reading')} done={stage !== 'reading'} />
          <ProgressStep
            active={stage === 'checking' || stage === 'categorizing'}
            label={t('scan.checking')}
            done={stage === 'categorizing'}
          />
          <ProgressStep active={stage === 'categorizing'} label={t('scan.categorizing')} done={false} />
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600">
          {stage === 'error' ? `${t('scan.failed')} ${error}` : error}
        </p>
      )}
    </main>
  );
}

function ProgressStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
          done ? 'bg-brand text-white' : active ? 'bg-brand/20 text-brand' : 'bg-slate-100 text-slate-400'
        }`}
      >
        {done ? '✓' : active ? '…' : ''}
      </span>
      <span className={active || done ? 'text-slate-800' : 'text-slate-400'}>{label}</span>
    </div>
  );
}
