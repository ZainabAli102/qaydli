'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Upload, Check, Trash2 } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { compressImage } from '@/lib/image-client';
import { updateSettings, removeLogo } from '@/app/(app)/settings/actions';

export function SettingsClient(props: {
  name: string;
  phone: string;
  address: string;
  paymentInstructions: string;
  usdRate: number;
  logoUrl: string | null;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState(props.phone);
  const [address, setAddress] = useState(props.address);
  const [pay, setPay] = useState(props.paymentInstructions);
  const [usdRate, setUsdRate] = useState(String(props.usdRate));
  const [logoUrl, setLogoUrl] = useState(props.logoUrl);
  const [busy, setBusy] = useState<null | 'save' | 'logo'>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy('save');
    setError(null);
    const res = await updateSettings({
      phone,
      address,
      paymentInstructions: pay,
      usdRate: Number(usdRate) || props.usdRate,
    });
    setBusy(null);
    if ('error' in res) setError(res.error);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
  }

  async function uploadLogo(file: File) {
    setBusy('logo');
    setError(null);
    try {
      const img = await compressImage(file, 512, 0.9);
      const res = await fetch('/api/settings/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: img.base64, mimeType: img.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setLogoUrl(data.logoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function dropLogo() {
    setBusy('logo');
    const res = await removeLogo();
    setBusy(null);
    if ('error' in res) setError(res.error);
    else setLogoUrl(null);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-brand">
          <ChevronLeft size={20} className="rtl:-scale-x-100" /> {t('dash.title')}
        </Link>
        <h1 className="text-lg font-bold text-brand">{t('settings.title')}</h1>
      </div>

      {/* Logo */}
      <section className="mb-5">
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t('settings.logo')}</span>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-300">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="h-full w-full object-contain" />
            ) : (
              <Upload size={20} />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'logo'}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {logoUrl ? t('settings.changeLogo') : t('settings.uploadLogo')}
          </button>
          {logoUrl && (
            <button onClick={dropLogo} className="inline-flex items-center gap-1 text-sm text-slate-400">
              <Trash2 size={15} /> {t('settings.removeLogo')}
            </button>
          )}
        </div>
      </section>

      <div className="space-y-4">
        <Field label={t('settings.phone')} value={phone} onChange={setPhone} inputMode="tel" />
        <Field label={t('settings.address')} value={address} onChange={setAddress} />
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">
            {t('settings.paymentInstructions')}
          </span>
          <textarea
            value={pay}
            onChange={(e) => setPay(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-500">{t('settings.paymentInstructionsHint')}</span>
        </label>
        <Field
          label={t('settings.usdRate')}
          value={usdRate}
          onChange={setUsdRate}
          inputMode="numeric"
        />

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <button
          onClick={save}
          disabled={busy === 'save'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
        >
          <Check size={18} /> {saved ? t('settings.saved') : busy === 'save' ? t('settings.saving') : t('settings.save')}
        </button>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email';
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
      />
    </label>
  );
}
