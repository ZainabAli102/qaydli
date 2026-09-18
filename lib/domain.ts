// Owner-facing domain constants: expense/income categories and payment methods.
// Labels are translated via lib/i18n (keys `cat.<slug>` and `pay.<slug>`).

export const CATEGORIES = [
  'supplies',
  'rent',
  'salaries',
  'utilities',
  'transport',
  'marketing',
  'office_fitout',
  'maintenance',
  'medical_personal',
  'bank_fees',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

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
  [/pharmac|صيدلي|دهرمان|دارمان|medical|clinic|hospital/i, 'medical_personal'],
  [/rent|ايجار|كرێ|كراء/i, 'rent'],
  [/salar|راتب|مووچە|payroll|wage/i, 'salaries'],
  [/electric|كهرب|كارەبا|water|ماء|gas|utility|فاتورة الكهرباء/i, 'utilities'],
  [/taxi|transport|نقل|گواستنەوە|fuel|بنزين|وقود|delivery|توصيل/i, 'transport'],
  [/market|اعلان|ڕیکلام|advert|print|طباعة|design/i, 'marketing'],
  [/furnitur|اثاث|مۆبیلیا|curtain|ستائر|پەردە|home center|bellona|fit-?out|decor/i, 'office_fitout'],
  [/maintenanc|صيانة|چاککردن|repair|تصليح/i, 'maintenance'],
  [/bank|بنك|بانک|transfer fee|رسوم|commission|عمولة/i, 'bank_fees'],
];

/** A first-guess category for a new vendor from free text. Defaults to 'other'. */
export function suggestCategory(text: string | null | undefined): Category {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return 'other';
  for (const [re, cat] of HINTS) if (re.test(t)) return cat;
  return 'other';
}

export const FREE_TRIAL_LIMIT = 10;
