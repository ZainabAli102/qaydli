// Qaydli extraction engine — public types.
//
// The engine is a PURE function: extract(imageBase64, opts) -> ReceiptResult.
// It performs no database or storage calls. Its only outside contact is through
// an injected ProviderAdapter (an OpenAI vision adapter ships; an Anthropic stub
// is included). Every scalar field carries its own 0-1 confidence so the UI and
// the books can treat a shaky reading differently from a certain one.

export type DocumentType =
  | 'invoice'
  | 'receipt'
  | 'payment_receipt'
  | 'voucher'
  | 'unknown';

export type Currency = 'IQD' | 'USD' | 'mixed';

/** A value the model read, with how sure it is (0 = guess, 1 = certain). */
export interface Confident<T> {
  value: T;
  confidence: number;
}

export interface LineItem {
  description: string | null;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  confidence: number;
}

export type FlagSeverity = 'info' | 'warn' | 'error';

/** A machine-readable note about something the caller should look at. */
export interface Flag {
  code: string;
  message: string;
  severity: FlagSeverity;
}

/**
 * Amounts are returned as written on the document, in the currency named by
 * `currency` (and `paid_currency` for the paid figure). Currency conversion to
 * the books' base currency (IQD) is a downstream concern, not the engine's.
 */
export interface ReceiptResult {
  document_type: Confident<DocumentType>;
  vendor: Confident<string | null>;
  /** Vendor name transliterated to Latin script (English spelling). */
  vendor_latin: Confident<string | null>;
  vendor_phone: Confident<string | null>;
  invoice_number: Confident<string | null>;
  /** The date exactly as written on the document (digits/script preserved). */
  date_raw: Confident<string | null>;
  date: Confident<string | null>; // ISO 8601 (YYYY-MM-DD), parsed in code from date_raw
  currency: Confident<Currency>;
  line_items: LineItem[];
  subtotal: Confident<number | null>;
  discount: Confident<number | null>;
  total: Confident<number | null>;
  paid_amount: Confident<number | null>;
  paid_currency: Confident<Currency | null>;
  remaining: Confident<number | null>;
  payment_method: Confident<string | null>;
  language: Confident<string | null>;
  notes: Confident<string | null>;
  flags: Flag[];
  /** Which model produced this result (set by the engine, not the model). */
  model_used: string | null;
}

export type ProviderName = 'openai' | 'anthropic';

/** Token usage reported by a provider for one extraction call. */
export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** What an adapter receives. The prompt is built by the engine, not the adapter. */
export interface AdapterInput {
  imageBase64: string;
  mimeType: string;
  model?: string;
  apiKey?: string;
  signal?: AbortSignal;
  systemPrompt: string;
  userPrompt: string;
  /** Optional hook the adapter calls with token usage (and the model) per request. */
  captureUsage?: (usage: Usage, model: string) => void;
}

/** The boundary between the pure engine and a vision model. */
export interface ProviderAdapter {
  name: ProviderName;
  extract(input: AdapterInput): Promise<ReceiptResult>;
}

export interface ExtractOptions {
  /** Which built-in adapter to use. Default: 'openai'. Ignored if `adapter` set. */
  provider?: ProviderName;
  /** Inject an adapter directly (used by tests and the Anthropic stub). */
  adapter?: ProviderAdapter;
  mimeType?: string; // default 'image/jpeg'
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  /** Reference "today" the prompt uses to resolve years/missing dates. Default: now. */
  now?: Date;
  /** Optional hook called with token usage (and model) for each model request. */
  captureUsage?: (usage: Usage, model: string) => void;
  /** Run the in-code maths checker after extraction. Default: true. */
  runChecks?: boolean;
}

/** Options for the two-tier escalation extractor. */
export interface EscalationOptions extends ExtractOptions {
  /** Cheaper first-pass model. Default: 'gpt-4o'. */
  primaryModel?: string;
  /** Stronger model used when the first pass looks shaky. Default: 'gpt-5.6-sol'. */
  secondaryModel?: string;
}
