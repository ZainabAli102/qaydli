// Qaydli extraction engine — public entry point.
//
// extract(imageBase64, opts) -> ReceiptResult is a PURE function: no database,
// no storage, no environment side effects beyond the injected/selected model
// adapter. Give it an image, get a structured, maths-checked reading back.
//
// extractWithEscalation runs a cheap model first and re-runs with a stronger
// one only when the first pass looks shaky (a flag, or low money-field
// confidence), keeping cost down while protecting the numbers that matter.

import type { EscalationOptions, ExtractOptions, ReceiptResult } from './types';
import { getAdapter } from './providers';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { applyDateFromRaw } from './date';
import { runChecks } from './checker';

export * from './types';
export { parseReceiptResult, normalizeDigits, toNumber } from './schema';
export { getAdapter, createOpenAIAdapter, createAnthropicAdapter } from './providers';
export { SYSTEM_PROMPT, USER_PROMPT, buildUserPrompt } from './prompt';
export { runChecks, wordsToNumberEn } from './checker';
export { parseDateRaw, applyDateFromRaw } from './date';

const DEFAULT_PRIMARY = 'gpt-4o';
const DEFAULT_SECONDARY = 'gpt-5.6-sol';

/** Money fields whose low confidence should trigger escalation. */
function lowMoneyConfidence(r: ReceiptResult): boolean {
  const fields = [r.total, r.subtotal, r.discount, r.paid_amount, r.remaining];
  return fields.some((f) => f.value !== null && f.confidence < 0.8);
}

/** True when a first-pass result looks shaky enough to re-run on a stronger model. */
export function needsEscalation(r: ReceiptResult): boolean {
  // A raised problem flag (warn/error). The info-level "math_ok" is not one.
  const problemFlag = r.flags.some((f) => f.severity !== 'info');
  return problemFlag || lowMoneyConfidence(r);
}

export async function extract(
  imageBase64: string,
  opts: ExtractOptions = {}
): Promise<ReceiptResult> {
  const adapter = opts.adapter ?? getAdapter(opts.provider ?? 'openai');
  const now = opts.now ?? new Date();

  const raw = await adapter.extract({
    imageBase64,
    mimeType: opts.mimeType ?? 'image/jpeg',
    model: opts.model,
    apiKey: opts.apiKey,
    signal: opts.signal,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(now),
    captureUsage: opts.captureUsage,
  });

  // Parse the authoritative date from date_raw in code, then check the maths.
  const dated = applyDateFromRaw(raw, now);
  const result = opts.runChecks === false ? dated : runChecks(dated);
  result.model_used = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_PRIMARY;
  return result;
}

/**
 * Two-tier extraction: run the primary (cheap) model; if the result looks shaky
 * (needsEscalation), re-run with the secondary (stronger) model and take that.
 * `model_used` on the returned result records which model produced it.
 */
export async function extractWithEscalation(
  imageBase64: string,
  opts: EscalationOptions = {}
): Promise<ReceiptResult> {
  const primary = opts.primaryModel ?? DEFAULT_PRIMARY;
  const secondary = opts.secondaryModel ?? DEFAULT_SECONDARY;

  const first = await extract(imageBase64, { ...opts, provider: 'openai', model: primary });
  if (!needsEscalation(first)) return first;

  return extract(imageBase64, { ...opts, provider: 'openai', model: secondary });
}
