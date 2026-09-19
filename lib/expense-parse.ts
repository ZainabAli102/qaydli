// "Describe" flow for Add manually: turn a plain-language line ("Paid 25,000 for
// fuel yesterday, cash") into a draft the owner confirms. Server-side model call
// OUTSIDE the pure extraction engine — text → structured draft, no DB/Storage.

import OpenAI from 'openai';
import { normalizeDigits } from '@/lib/engine';
import { hintsSuffix, type ParseHints } from '@/lib/invoice-parse';
import { CATEGORIES, PAYMENT_METHODS, isCategory, type Category, type PaymentMethod } from '@/lib/domain';

export interface ParsedExpenseDraft {
  vendor: string | null;
  total: number | null;
  currency: 'IQD' | 'USD' | null;
  type: 'expense' | 'income' | null;
  category: Category | null;
  date: string | null; // ISO 'YYYY-MM-DD'
  payment_method: PaymentMethod | null;
  notes: string | null;
}

function buildSystem(todayISO: string): string {
  return `You turn a short spoken or written note about a business transaction into a draft as STRICT JSON.
The note may be English, Arabic, or Kurdish (Sorani), often with Arabic-Indic digits and separators like 25,000 or ٢٥٬٠٠٠.
Today is ${todayISO}.

Return ONLY a JSON object with these keys:
- "vendor": who was paid or who paid (shop, person, client), else null.
- "total": the amount as a plain number (no separators, no currency symbol), else null.
- "currency": "IQD" or "USD" if clear ($ or USD → USD; dinar/IQD/د.ع → IQD), else null.
- "type": "expense" for money spent, "income" for money received, else "expense".
- "category": ONE slug from this list that best fits, else null: ${CATEGORIES.join(', ')}.
- "date": ISO "YYYY-MM-DD". Resolve relative words against today ("yesterday"/"أمس"/"دوێنێ" = the day before today). If no date is mentioned, null.
- "payment_method": one of ${PAYMENT_METHODS.join(', ')} if stated (cash/نقد, card/بطاقة, transfer/تحويل), else null.
- "notes": any leftover detail, else null.
Never invent an amount. Output JSON only, no prose, no code fences.`;
}

function stripJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = normalizeDigits(v).replace(/[,٬\s]/g, '').replace(/[^0-9.\-]/g, '');
    const n = Number(cleaned);
    return cleaned !== '' && Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

/** Coerce whatever the model returned into a safe, typed draft. */
export function normalizeExpenseDraft(raw: unknown): ParsedExpenseDraft {
  const o = (raw ?? {}) as Record<string, unknown>;
  const cur = str(o.currency);
  const currency = cur === 'USD' || cur === 'IQD' ? cur : null;
  const typeRaw = str(o.type);
  const type = typeRaw === 'income' ? 'income' : typeRaw === 'expense' ? 'expense' : null;
  const cat = str(o.category);
  const category = cat && isCategory(cat) ? (cat as Category) : null;
  const pm = str(o.payment_method);
  const payment_method = pm && (PAYMENT_METHODS as readonly string[]).includes(pm) ? (pm as PaymentMethod) : null;
  const date = str(o.date);

  return {
    vendor: str(o.vendor),
    total: num(o.total),
    currency,
    type,
    category,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    payment_method,
    notes: str(o.notes),
  };
}

export async function parseExpenseDraft(
  text: string,
  opts: { apiKey?: string; model?: string; todayISO: string; hints?: ParseHints } = {
    todayISO: new Date().toISOString().slice(0, 10),
  }
): Promise<ParsedExpenseDraft> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const client = new OpenAI({ apiKey });
  const model = opts.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o';
  const isReasoning = /^(o\d|gpt-5)/.test(model);

  const res = await client.chat.completions.create({
    model,
    ...(isReasoning ? {} : { temperature: 0 }),
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystem(opts.todayISO) + hintsSuffix(opts.hints) },
      { role: 'user', content: text.slice(0, 2000) },
    ],
  });
  const body = res.choices[0]?.message?.content ?? '{}';
  return normalizeExpenseDraft(JSON.parse(stripJson(body)));
}
