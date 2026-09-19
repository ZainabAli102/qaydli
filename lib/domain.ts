// Owner-facing domain constants: expense/income categories and payment methods.
// Labels are translated via lib/i18n (keys `cat.<slug>` and `pay.<slug>`).

export const CATEGORIES = [
  'supplies',
  'furniture',
  'equipment_assets',
  'inventory',
  'rent',
  'salaries',
  'utilities',
  'fuel',
  'transport',
  'food_hospitality',
  'marketing',
  'software_subscriptions',
  'professional_services',
  'bank_fees',
  'taxes_gov_fees',
  'maintenance',
  'medical_personal',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Runtime guard: is this string one of our categories? */
export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type TxnType = 'expense' | 'income';

/** ledger direction: expense = money out, income = money in. */
export function typeToDirection(type: TxnType): 'in' | 'out' {
  return type === 'income' ? 'in' : 'out';
}
export function directionToType(direction: 'in' | 'out'): TxnType {
  return direction === 'in' ? 'income' : 'expense';
}

// Keyword → category hints (matched against vendor + notes, case-insensitive).
// Vendor memory always wins over this; it is only a first guess for new vendors.
const HINTS: Array<[RegExp, Category]> = [
  [/pharmac|صيدلي|دهرمان|دارمان|medical|clinic|hospital|مستشفى|نەخۆشخانە/i, 'medical_personal'],
  [/salar|راتب|مووچە|payroll|wage/i, 'salaries'],
  [/\brent\b|ايجار|كرێ|كراء|إيجار/i, 'rent'],
  [/fuel|بنزين|وقود|diesel|gasoline|سۆتەمەنی|گازۆیل|petrol/i, 'fuel'],
  [/taxi|transport|نقل|گواستنەوە|delivery|توصيل|shipping|شحن|freight/i, 'transport'],
  [/restaurant|مطعم|چێشتخانە|\bfood\b|طعام|خۆراک|cafe|قهوة|hotel|فندق|catering|ضيافة/i, 'food_hospitality'],
  [/software|subscription|اشتراك|بەشداری|saas|hosting|domain|licen[cs]e|ترخيص|app store|figma|adobe/i, 'software_subscriptions'],
  [/consult|lawyer|محامي|accountant|محاسب|legal|قانوني|engineer|مهندس|خدمات مهنية/i, 'professional_services'],
  [/\btax\b|ضريبة|ضرائب|باج|government|حكومة|حکومەت|customs|جمرك|رسوم حكومية/i, 'taxes_gov_fees'],
  [/bank|بنك|بانک|transfer fee|commission|عمولة|رسوم تحويل/i, 'bank_fees'],
  [/electric|كهرب|كارەبا|water|ماء|ئاو|utility|فاتورة|internet|انترنت|ئینتەرنێت|generator|مولد/i, 'utilities'],
  [/market|اعلان|إعلان|ڕیکلام|advert|print|طباعة|design|بازاڕ|billboard|social media/i, 'marketing'],
  [/furnitur|اثاث|أثاث|مۆبیلیا|curtain|ستائر|پەردە|bellona|sofa|desk|chair|table|decor|ديكور/i, 'furniture'],
  [/equipment|machine|جهاز|أجهزة|ئامێر|asset|tool|معدات|device/i, 'equipment_assets'],
  [/inventory|stock|بضاعة|مخزون|کاڵا|goods|raw material|مواد خام/i, 'inventory'],
  [/maintenanc|صيانة|چاککردنەوە|repair|تصليح|إصلاح/i, 'maintenance'],
  [/supplies|مستلزمات|قرطاسية|stationery|پێداویستی/i, 'supplies'],
];

/** A first-guess category for a new vendor from free text. Defaults to 'other'. */
export function suggestCategory(text: string | null | undefined): Category {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return 'other';
  for (const [re, cat] of HINTS) if (re.test(t)) return cat;
  return 'other';
}

export interface CategoryResolution {
  category: Category; // ALWAYS a valid, non-empty category
  suggested: boolean; // true when it came from vendor memory or the model
  fromMemory: boolean; // true when it came from vendor memory
}

/**
 * Resolve the Review category from all sources, always returning a VALID slug
 * so the <select> can never render empty:
 *   vendor memory → model suggestion → keyword guess → 'other'.
 * Every source is validated against the current category list, so a retired or
 * misspelled slug (e.g. an old 'office_fitout') is ignored instead of blanking
 * the field. The "suggested" chip shows only for memory/model, not the guess.
 */
export function resolveCategory(opts: {
  memory?: string | null;
  model?: string | null;
  text?: string | null;
}): CategoryResolution {
  if (isCategory(opts.memory)) return { category: opts.memory, suggested: true, fromMemory: true };
  if (isCategory(opts.model)) return { category: opts.model, suggested: true, fromMemory: false };
  return { category: suggestCategory(opts.text), suggested: false, fromMemory: false };
}

export const FREE_TRIAL_LIMIT = 10;
