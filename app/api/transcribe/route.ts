import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isLocale } from '@/lib/i18n';
import { transcribe, type TranscribeProvider } from '@/lib/transcribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
};

// POST /api/transcribe  (multipart: audio, lang, durationMs)  ?provider=elevenlabs|openai
// Transcribes a short voice note. Primary provider is ElevenLabs Scribe with an
// OpenAI fallback; ?provider= forces one provider for A/B testing. The audio is
// held in memory only and never stored. Logs provider + language + duration for
// cost tracking (never the transcript body).
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
  // Guard against oversized uploads (both providers cap around 25 MB; 60s ≪ that).
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Audio is too large' }, { status: 413 });
  }

  const langParam = String(form.get('lang') ?? '');
  const locale = isLocale(langParam) ? langParam : 'en';
  const durationMs = Number(form.get('durationMs') ?? 0) || 0;

  const p = req.nextUrl.searchParams.get('provider');
  const forced: TranscribeProvider | undefined =
    p === 'elevenlabs' || p === 'openai' ? p : undefined;

  const type = (audio.type || 'audio/webm').split(';')[0];
  const ext = EXT[type] ?? 'webm';

  try {
    const buffer = Buffer.from(await audio.arrayBuffer()); // memory only
    const result = await transcribe(
      { buffer, filename: `voice.${ext}`, contentType: audio.type || 'audio/webm', locale },
      forced
    );

    // Cost tracking: provider + language + duration (no transcript body).
    console.log(
      `[transcribe] provider=${result.provider} fellBack=${result.fellBack} lang=${langParam || 'auto'} durMs=${durationMs} bytes=${audio.size} chars=${result.text.length}`
    );

    return NextResponse.json({ text: result.text, provider: result.provider });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transcription failed' },
      { status: 502 }
    );
  }
}
