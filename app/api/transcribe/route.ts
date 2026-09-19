import { NextResponse, type NextRequest } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { createClient } from '@/lib/supabase/server';
import { isLocale } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// UI locale → speech-to-text language hint. Whisper/gpt-4o-transcribe take an
// ISO-639-1 code; Central Kurdish (ckb) has no reliable code, so we let the
// model auto-detect for it.
const LANG_HINT: Record<string, string | undefined> = { en: 'en', ar: 'ar', ckb: undefined };

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
};

// POST /api/transcribe  (multipart: audio, lang, durationMs)
// Transcribes a short voice note with OpenAI speech-to-text. The audio is held
// in memory only and never stored. Logs language + duration for cost tracking.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: 'audio is required' }, { status: 400 });
  }
  // Guard against oversized uploads (OpenAI caps at 25 MB; 60s is far smaller).
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio is too large' }, { status: 413 });
  }

  const langParam = String(form.get('lang') ?? '');
  const language = isLocale(langParam) ? LANG_HINT[langParam] : undefined;
  const durationMs = Number(form.get('durationMs') ?? 0) || 0;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY is not set' }, { status: 500 });

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
  const type = audio.type || 'audio/webm';
  const ext = EXT[type.split(';')[0]] ?? 'webm';

  try {
    const buffer = Buffer.from(await audio.arrayBuffer()); // memory only
    const file = await toFile(buffer, `voice.${ext}`, { type });
    const client = new OpenAI({ apiKey });
    const res = await client.audio.transcriptions.create({
      file,
      model,
      ...(language ? { language } : {}),
    });
    const text = (res.text ?? '').trim();

    // Cost tracking: language requested + audio duration (no transcript body).
    console.log(
      `[transcribe] lang=${langParam || 'auto'} hint=${language ?? 'auto'} model=${model} durMs=${durationMs} bytes=${audio.size} chars=${text.length}`
    );

    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transcription failed' },
      { status: 502 }
    );
  }
}
