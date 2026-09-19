'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Mic, Square, Loader2 } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';

const MAX_MS = 60_000;
// Prefer Opus in webm/ogg; iOS Safari only offers mp4/aac. '' = browser default.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];

type Phase = 'idle' | 'recording' | 'transcribing';

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* isTypeSupported can throw on some browsers */
    }
  }
  return ''; // supported, but let the browser choose the container
}

export function DescribeBox(props: {
  value: string;
  onChange: (v: string) => void;
  onFill: () => void | Promise<void>;
  filling: boolean;
  placeholder: string;
  hint: string;
  minLen?: number;
}) {
  const { t, locale } = useLocale();
  const min = props.minLen ?? 3;

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0); // ms
  const [level, setLevel] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);

  // Tear everything down on unmount so the mic light never lingers.
  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (timerRef.current != null) clearInterval(timerRef.current);
    rafRef.current = null;
    timerRef.current = null;
    try {
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((tk) => tk.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  async function start() {
    setError(null);
    const mime = pickMime();
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (mime === null || !md?.getUserMedia) {
      setError(t('voice.unsupported'));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? t('voice.permissionDenied') : t('voice.unsupported'));
      return;
    }
    streamRef.current = stream;

    // Level meter (Web Audio). Failure here must not block recording.
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        await ctx.resume().catch(() => {}); // iOS needs a resume in the gesture
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        audioCtxRef.current = ctx;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2.2));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch {
      /* no level meter — recording still works */
    }

    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      cleanup();
      setError(t('voice.unsupported'));
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      const durMs = Date.now() - startedRef.current;
      cleanup();
      setLevel(0);
      void transcribe(blob, durMs);
    };

    startedRef.current = Date.now();
    setElapsed(0);
    recorder.start();
    setPhase('recording');
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startedRef.current;
      setElapsed(ms);
      if (ms >= MAX_MS) stop();
    }, 200);
  }

  function stop() {
    if (timerRef.current != null) clearInterval(timerRef.current);
    timerRef.current = null;
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      setPhase('transcribing');
      try {
        r.stop(); // fires onstop → transcribe
      } catch {
        cleanup();
        setPhase('idle');
        setError(t('voice.failed'));
      }
    } else {
      cleanup();
      setPhase('idle');
    }
  }

  async function transcribe(blob: Blob, durMs: number) {
    if (blob.size < 1200) {
      setPhase('idle');
      setError(t('voice.noAudio'));
      return;
    }
    setPhase('transcribing');
    try {
      const fd = new FormData();
      const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
      fd.append('audio', blob, `voice.${ext}`);
      fd.append('lang', locale);
      fd.append('durationMs', String(durMs));
      // Forward a ?provider= A/B flag from the page URL, if present.
      const provider = new URLSearchParams(window.location.search).get('provider');
      const url = provider ? `/api/transcribe?provider=${encodeURIComponent(provider)}` : '/api/transcribe';
      const res = await fetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('voice.failed'));
      const text = String(data.text ?? '').trim();
      if (!text) {
        setError(t('voice.noAudio'));
      } else {
        props.onChange(props.value.trim() ? `${props.value.trim()} ${text}` : text);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('voice.failed'));
    } finally {
      setPhase('idle');
    }
  }

  const secs = Math.floor(elapsed / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const canFill = props.value.trim().length >= min && !props.filling && phase === 'idle';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={3}
        placeholder={props.placeholder}
        disabled={phase !== 'idle'}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand focus:outline-none disabled:bg-slate-50"
      />
      <p className="mt-1 text-xs text-slate-500">{props.hint} · {t('voice.hint')}</p>

      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {phase === 'recording' ? (
        <div className="mt-2 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-sm text-red-700">{clock}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-red-100">
            <span
              className="block h-full rounded-full bg-red-500 transition-[width] duration-100"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </span>
          <button
            type="button"
            onClick={stop}
            aria-label={t('voice.stop')}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Square size={14} fill="currentColor" /> {t('voice.stop')}
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={start}
            disabled={phase === 'transcribing' || props.filling}
            aria-label={t('voice.record')}
            className="flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            {phase === 'transcribing' ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t('voice.transcribing')}
              </>
            ) : (
              <>
                <Mic size={16} /> {t('voice.record')}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => props.onFill()}
            disabled={!canFill}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Sparkles size={16} /> {props.filling ? t('describe.filling') : t('describe.fill')}
          </button>
        </div>
      )}
    </div>
  );
}
