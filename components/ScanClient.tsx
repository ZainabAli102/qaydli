'use client';

import { useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { signOut } from '@/app/scan/actions';

// Reads a File as a base64 data URL and returns just the base64 payload.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ScanClient({ businessName }: { businessName: string }) {
  const { t } = useLocale();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function scan() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      // The route returns { document_id, storage_path, result }.
      setResult(data?.result ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand">{t('scanTitle')}</h1>
          <p className="text-sm text-slate-500">{businessName}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <form action={signOut}>
            <button className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700">
              {t('signOut')}
            </button>
          </form>
        </div>
      </header>

      <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        <span className="text-base font-medium text-brand">{t('chooseImage')}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />
      </label>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="receipt preview"
          className="mb-4 max-h-72 w-full rounded-lg object-contain"
        />
      )}

      <button
        onClick={scan}
        disabled={!file || busy}
        className="mb-4 w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {busy ? t('scanning') : t('scan')}
      </button>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {result != null && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('result')}</h2>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
