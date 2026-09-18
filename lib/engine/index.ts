// Qaydli extraction engine — public entry point.
//
// extract(imageBase64, opts) -> ReceiptResult is a PURE function: no database,
// no storage, no environment side effects beyond the injected/selected model
// adapter. Give it an image, get a structured, maths-checked reading back.

import type { ExtractOptions, ReceiptResult } from './types';
import { getAdapter } from './providers';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { runChecks } from './checker';

export * from './types';
export { parseReceiptResult, normalizeDigits, toNumber } from './schema';
export { getAdapter, createOpenAIAdapter, createAnthropicAdapter } from './providers';
export { SYSTEM_PROMPT, USER_PROMPT, buildUserPrompt } from './prompt';
export { runChecks, wordsToNumberEn } from './checker';

export async function extract(
  imageBase64: string,
  opts: ExtractOptions = {}
): Promise<ReceiptResult> {
  const adapter = opts.adapter ?? getAdapter(opts.provider ?? 'openai');

  const result = await adapter.extract({
    imageBase64,
    mimeType: opts.mimeType ?? 'image/jpeg',
    model: opts.model,
    apiKey: opts.apiKey,
    signal: opts.signal,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(opts.now ?? new Date()),
  });

  return opts.runChecks === false ? result : runChecks(result);
}
