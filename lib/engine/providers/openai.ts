import OpenAI from 'openai';
import type { AdapterInput, ProviderAdapter } from '../types';
import { parseReceiptResult } from '../schema';

// Strip accidental ```json fences and grab the outermost JSON object.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/**
 * OpenAI vision adapter. Uses a JSON-object response and a temperature of 0 for
 * repeatability; the maths are re-checked in code afterwards, not trusted here.
 */
export function createOpenAIAdapter(): ProviderAdapter {
  return {
    name: 'openai',
    async extract(input: AdapterInput) {
      const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

      const client = new OpenAI({ apiKey });
      const model = input.model ?? process.env.OPENAI_VISION_MODEL ?? 'gpt-4o';
      const dataUrl = `data:${input.mimeType};base64,${input.imageBase64}`;

      const res = await client.chat.completions.create(
        {
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: input.systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: input.userPrompt },
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              ],
            },
          ],
        },
        { signal: input.signal }
      );

      const text = res.choices[0]?.message?.content ?? '{}';
      return parseReceiptResult(JSON.parse(extractJson(text)));
    },
  };
}
