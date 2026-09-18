'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLocale } from '@/components/LocaleProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

type Method = 'email' | 'phone';

export default function LoginPage() {
  const { t } = useLocale();
  const router = useRouter();
  const supabase = createClient();

  const [method, setMethod] = useState<Method>('email');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fn = isSignUp
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });
      const { error } = await fn;
      if (error) throw error;
      router.replace('/scan');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
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
        <div>
          <h1 className="text-2xl font-bold text-brand">{t('appName')}</h1>
          <p className="text-sm text-slate-500">{t('tagline')}</p>
        </div>
        <LanguageSwitcher />
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <TabButton active={method === 'email'} onClick={() => setMethod('email')}>
          {t('signInWithEmail')}
        </TabButton>
        <TabButton active={method === 'phone'} onClick={() => setMethod('phone')}>
          {t('signInWithPhone')}
        </TabButton>
      </div>

      {method === 'email' ? (
        <form onSubmit={handleEmail} className="space-y-3">
          <Field
            label={t('email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
          />
          <Field
            label={t('password')}
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={setPassword}
            required
          />
          <SubmitButton busy={busy}>{isSignUp ? t('createAccount') : t('signIn')}</SubmitButton>
          <button
            type="button"
            className="w-full text-sm text-brand underline"
            onClick={() => setIsSignUp((v) => !v)}
          >
            {isSignUp ? t('signIn') : t('createAccount')}
          </button>
        </form>
      ) : !codeSent ? (
        <form onSubmit={sendCode} className="space-y-3">
          <Field
            label={t('phone')}
            type="tel"
            autoComplete="tel"
            placeholder="+9647..."
            value={phone}
            onChange={setPhone}
            required
          />
          <SubmitButton busy={busy}>{t('sendCode')}</SubmitButton>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-3">
          <Field
            label={t('code')}
            type="text"
            inputMode="numeric"
            value={code}
            onChange={setCode}
            required
          />
          <SubmitButton busy={busy}>{t('verifyCode')}</SubmitButton>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium ${
        active ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none"
      />
    </label>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
    >
      {busy ? '…' : children}
    </button>
  );
}
