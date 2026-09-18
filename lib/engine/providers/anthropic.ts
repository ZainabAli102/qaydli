import type { AdapterInput, ProviderAdapter } from '../types';
// import Anthropic from '@anthropic-ai/sdk';
// import { parseReceiptResult } from '../schema';

/**
 * Anthropic vision adapter — phase-0 STUB.
 *
 * The interface and input plumbing are in place so this can become a real
 * adapter without touching the engine. To flesh it out: send a messages.create
 * with an image content block (base64) plus the system/user prompts, then run
 * the response through parseReceiptResult, mirroring the OpenAI adapter.
 */
export function createAnthropicAdapter(): ProviderAdapter {
  return {
    name: 'anthropic',
    async extract(_input: AdapterInput) {
      throw new Error(
        'Anthropic adapter is a phase-0 stub. Use the OpenAI provider, or inject a custom adapter.'
      );
    },
  };
}
