import type { ProviderAdapter, ProviderName } from '../types';
import { createOpenAIAdapter } from './openai';
import { createAnthropicAdapter } from './anthropic';

export { createOpenAIAdapter, createAnthropicAdapter };

/** Resolve a built-in adapter by name. Default provider is OpenAI. */
export function getAdapter(provider: ProviderName = 'openai'): ProviderAdapter {
  switch (provider) {
    case 'anthropic':
      return createAnthropicAdapter();
    case 'openai':
    default:
      return createOpenAIAdapter();
  }
}
