// Speech-to-text providers for the voice Describe boxes. ElevenLabs Scribe is
// the primary provider (best coverage for Arabic + Central Kurdish); OpenAI is
// the fallback. Server-only. Audio is passed as an in-memory buffer and never
// stored.

import OpenAI, { toFile } from 'openai';

export type TranscribeProvider = 'elevenlabs' | 'openai';

// UI locale → provider language_code.
// ElevenLabs Scribe accepts ISO-639-1/639-3 and covers Central Kurdish (ckb).
const EL_LANG: Record<string, string | undefined> = { en: 'en', ar: 'ar', ckb: 'ckb' };
// Whisper/gpt-4o-transcribe take ISO-639-1 only; ckb has none, so auto-detect.
const OA_LANG: Record<string, string | undefined> = { en: 'en', ar: 'ar', ckb: undefined };

const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

export interface AudioInput {
  buffer: Buffer;
  filename: string;
  contentType: string;
  locale: string;
}

/** ElevenLabs Scribe. Throws on any non-2xx or missing key (caller may fall back). */
export async function transcribeElevenLabs(input: AudioInput): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const model = process.env.ELEVENLABS_TRANSCRIBE_MODEL || 'scribe_v1';
  const lang = EL_LANG[input.locale];

  const fd = new FormData();
  const bytes = new Uint8Array(input.buffer); // BlobPart with a plain ArrayBuffer
  fd.append('file', new Blob([bytes], { type: input.contentType }), input.filename);
  fd.append('model_id', model);
  if (lang) fd.append('language_code', lang);

  const res = await fetch(ELEVENLABS_URL, {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: fd,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? '').trim();
}

/** OpenAI speech-to-text (Whisper / gpt-4o-transcribe). */
export async function transcribeOpenAI(input: AudioInput): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
  const lang = OA_LANG[input.locale];

  const client = new OpenAI({ apiKey: key });
  const file = await toFile(input.buffer, input.filename, { type: input.contentType });
  const res = await client.audio.transcriptions.create({
    file,
    model,
    ...(lang ? { language: lang } : {}),
  });
  return (res.text ?? '').trim();
}

export interface TranscribeResult {
  text: string;
  provider: TranscribeProvider;
  fellBack: boolean;
}

/**
 * Transcribe, honouring an optional forced provider (A/B testing):
 *   - 'openai'      → OpenAI only.
 *   - 'elevenlabs'  → ElevenLabs only (no fallback, for clean A/B measurement).
 *   - undefined     → ElevenLabs first, OpenAI fallback if it errors.
 */
export async function transcribe(
  input: AudioInput,
  forced?: TranscribeProvider
): Promise<TranscribeResult> {
  if (forced === 'openai') {
    return { text: await transcribeOpenAI(input), provider: 'openai', fellBack: false };
  }
  if (forced === 'elevenlabs') {
    return { text: await transcribeElevenLabs(input), provider: 'elevenlabs', fellBack: false };
  }
  try {
    return { text: await transcribeElevenLabs(input), provider: 'elevenlabs', fellBack: false };
  } catch (err) {
    console.warn(
      `[transcribe] ElevenLabs failed, falling back to OpenAI: ${err instanceof Error ? err.message : String(err)}`
    );
    return { text: await transcribeOpenAI(input), provider: 'openai', fellBack: true };
  }
}
