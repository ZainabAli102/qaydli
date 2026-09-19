// "Describe" flow: turn a plain-language line ("Invoice Hawler school for 3 days
// training at 250,000, due 14 days") into a draft the owner confirms. This is a
// server-side model call that lives OUTSIDE the pure extraction engine — it does
// no DB/Storage work, only text → structured draft.

import OpenAI from 'openai';
import { normalizeDigits } from '@/lib/engine';

export interface ParsedInvoiceDraft {
  client_name: string | null;
  items: Array<{ description: string; qty: number; unit_price: number }>;
  currency: 'IQD' | 'USD' | null;
  due_in_days: number | null;
  due_date: string | null; // ISO 'YYYY-MM-DD'
  notes: string | null;
}

const SYSTEM = `You turn a short business instruction into a draft sales invoice as STRICT JSON.
The user writes in English, Arabic, or Kurdish (Sorani), often with Arabic-Indic digits and thousands separators like 250,000 or ٢٥٠٬٠٠٠.

Return ONLY a JSON object with these keys:
- "client_name": the customer being billed, or null.
- "items": array of { "description": string, "qty": number, "unit_price": number }.
  Split "3 days training at 250,000" into qty=3, unit_price=250000, description="training".
  If only a lump sum is given, use qty=1 and unit_price=that amount.
  unit_price is the price PER unit, as a plain number (no separators, no currency symbol).
- "currency": "IQD" or "USD" if clearly stated ($ or USD → USD; dinar/IQD/د.ع → IQD), else null.
- "due_in_days": integer number of days until due if phrased like "due in 14 days"/"within 2 weeks", else null.
- "due_date": an explicit ISO date "YYYY-MM-DD" if a calendar date is given, else null.
- "notes": any remaining note, else null.
Never invent amounts. Output JSON only, no prose, no code fences.`;

function stripJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const cleaned = normalizeDigits(v).replace(/[,٬\s]/g, '').replace(/[^0-9.\-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s === '' ? null : s;
}

/** Coerce whatever the model returned into a safe, typed draft. */
export function normalizeDraft(raw: unknown): ParsedInvoiceDraft {
  const o = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw
    .map((it) => {
      const r = (it ?? {}) as Record<string, unknown>;
      const qty = num(r.qty) || 1;
      return {
        description: str(r.description) ?? '',
        qty,
        unit_price: num(r.unit_price ?? r.price ?? r.amount),
      };
    })
    .filter((it) => it.description !== '' || it.unit_price > 0);

  const cur = str(o.currency);
  const currency = cur === 'USD' || cur === 'IQD' ? cur : null;
  const dueDays = num(o.due_in_days);
  const dueDate = str(o.due_date);

  return {
    client_name: str(o.client_name ?? o.client),
    items,
    currency,
    due_in_days: dueDays > 0 ? Math.round(dueDays) : null,
    due_date: dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null,
    notes: str(o.notes),
  };
}

export async function parseInvoiceDraft(
  text: string,
  opts: { apiKey?: string; model?: string } = {}
): Promise<ParsedInvoiceDraft> {
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
      { role: 'system', content: SYSTEM },
      { role: 'user', content: text.slice(0, 2000) },
    ],
  });
  const body = res.choices[0]?.message?.content ?? '{}';
  return normalizeDraft(JSON.parse(stripJson(body)));
}
