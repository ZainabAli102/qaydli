'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Upload, Check, Trash2 } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { compressImage } from '@/lib/image-client';
import { renderInvoiceHtml } from '@/lib/invoice-html';
import { computeTotals, dueDateFrom, normalizeHex, ACCENT_PRESETS } from '@/lib/invoices';
import { todayISO } from '@/lib/dates';
import { updateSettings, removeLogo } from '@/app/(app)/settings/actions';

export function SettingsClient(props: {
  name: string;
  phone: string;
  address: string;
  email: string;
  taxNumber: string;
  accentColor: string;
  footer: string;
  paymentInstructions: string;
  usdRate: number;
  logoUrl: string | null;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState(props.phone);
  const [address, setAddress] = useState(props.address);
  const [email, setEmail] = useState(props.email);
  const [taxNumber, setTaxNumber] = useState(props.taxNumber);
  const [accent, setAccent] = useState(normalizeHex(props.accentColor));
  const [footer, setFooter] = useState(props.footer);
  const [pay, setPay] = useState(props.paymentInstructions);
  const [usdRate, setUsdRate] = useState(String(props.usdRate));
  const [logoUrl, setLogoUrl] = useState(props.logoUrl);
  const [busy, setBusy] = useState<null | 'save' | 'logo'>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live preview: the real invoice template with sample data + live branding.
  const previewHtml = useMemo(() => {
    const items = [
      { description: t('inv.itemDesc'), qty: 2, unit_price: 150000 },
      { description: t('inv.itemDesc'), qty: 1, unit_price: 100000 },
    ];
    const totals = computeTotals(items, 0);
    const today = todayISO();
    return renderInvoiceHtml({
      locale,
      number: 'INV-001',
      currency: 'IQD',
      issueDate: today,
      dueDate: dueDateFrom(today, 14),
      display: 'sent',
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      paid: 0,
      notes: null,
      accent,
      business: {
        name: props.name,
        phone,
        address,
        email,
        taxNumber,
        paymentInstructions: pay,
        footer,
        logoUrl,
      },
      client: { name: t('inv.client'), phone: null, email: null },
    });
  }, [locale, accent, props.name, phone, address, email, taxNumber, pay, footer, logoUrl, t]);

  async function save() {
    setBusy('save');
    setError(null);
    const res = await updateSettings({
      phone,
      address,
      email,
      taxNumber,
      accentColor: accent,
      footer,
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

      {/* Business details */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold text-slate-800">{t('settings.businessInfo')}</h2>
        <div className="space-y-3">
          <Field label={t('settings.phone')} value={phone} onChange={setPhone} inputMode="tel" />
          <Field label={t('settings.email')} value={email} onChange={setEmail} inputMode="email" />
          <Field label={t('settings.address')} value={address} onChange={setAddress} />
          <Field label={t('settings.usdRate')} value={usdRate} onChange={setUsdRate} inputMode="numeric" />
        </div>
      </section>

      {/* Invoice look */}
      <section className="mb-6">
        <h2 className="text-sm font-bold text-slate-800">{t('settings.invoiceLook')}</h2>
        <p className="mb-3 text-xs text-slate-500">{t('settings.invoiceLookHint')}</p>

        {/* Logo */}
        <div className="mb-4">
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
              accept="image/png,image/jpeg,image/webp"
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
        </div>

        {/* Accent colour */}
        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t('settings.accentColor')}</span>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setAccent(c)}
                aria-label={c}
                className={`h-8 w-8 rounded-full border-2 ${accent === c ? 'border-slate-800' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
              style={{ cursor: 'pointer' }}
            >
              <span className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: accent }} />
              {t('settings.customColor')}
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-0 w-0 opacity-0"
              />
            </label>
            <input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              onBlur={() => setAccent((a) => normalizeHex(a))}
              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Field label={t('settings.taxNumber')} value={taxNumber} onChange={setTaxNumber} />
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">
              {t('settings.paymentInstructions')}
            </span>
            <textarea
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('settings.paymentInstructionsHint')}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">{t('settings.footerNote')}</span>
            <textarea
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('settings.footerNoteHint')}</span>
          </label>
        </div>

        {/* Live preview */}
        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">{t('settings.preview')}</span>
          <InvoicePreview html={previewHtml} />
        </div>
      </section>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={save}
        disabled={busy === 'save'}
        className="sticky bottom-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white shadow-lg disabled:opacity-60"
      >
        <Check size={18} /> {saved ? t('settings.saved') : busy === 'save' ? t('settings.saving') : t('settings.save')}
      </button>
    </main>
  );
}

// Renders the real invoice HTML in an iframe, scaled to fit the column width so
// the owner sees exactly how the PDF and public link will look.
function InvoicePreview({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const LOGICAL = 720;
  const H = 940;
  const scale = w / LOGICAL;

  return (
    <div ref={ref} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div style={{ height: H * scale }}>
        <iframe
          title="invoice preview"
          srcDoc={html}
          scrolling="no"
          style={{
            width: LOGICAL,
            height: H,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
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
