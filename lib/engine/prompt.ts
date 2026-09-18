// The vision prompt. It is provider-agnostic: adapters send SYSTEM_PROMPT and
// the built user prompt alongside the image and must return the exact JSON
// shape below. The maths are NOT trusted to the model — code re-checks them.

export const OUTPUT_SHAPE = `{
  "document_type": { "value": "invoice|receipt|payment_receipt|voucher|unknown", "confidence": 0-1 },
  "vendor":        { "value": "string|null", "confidence": 0-1 },
  "vendor_latin":  { "value": "string|null", "confidence": 0-1 },
  "vendor_phone":  { "value": "string|null", "confidence": 0-1 },
  "invoice_number":{ "value": "string|null", "confidence": 0-1 },
  "date":          { "value": "YYYY-MM-DD|null", "confidence": 0-1 },
  "currency":      { "value": "IQD|USD|mixed", "confidence": 0-1 },
  "line_items": [
    { "description": "string|null", "qty": number|null, "unit_price": number|null, "line_total": number|null, "confidence": 0-1 }
  ],
  "subtotal":      { "value": number|null, "confidence": 0-1 },
  "discount":      { "value": number|null, "confidence": 0-1 },
  "total":         { "value": number|null, "confidence": 0-1 },
  "paid_amount":   { "value": number|null, "confidence": 0-1 },
  "paid_currency": { "value": "IQD|USD|null", "confidence": 0-1 },
  "remaining":     { "value": number|null, "confidence": 0-1 },
  "payment_method":{ "value": "string|null", "confidence": 0-1 },
  "language":      { "value": "string|null", "confidence": 0-1 },
  "notes":         { "value": "string|null", "confidence": 0-1 },
  "flags": [ { "code": "string", "message": "string", "severity": "info|warn|error" } ]
}`;

export const SYSTEM_PROMPT = `You extract structured data from photographs of receipts, invoices, vouchers and payment slips used by small businesses in Iraq and the Kurdistan Region. Documents may be in Arabic, Kurdish (Sorani), English, or a mix, printed or handwritten.

Return ONLY a single JSON object, no prose, no code fences. Every scalar field is an object { "value": ..., "confidence": 0-1 }. Confidence is your honest certainty for THAT field: 1 means clearly legible, ~0.5 means a plausible guess, low means barely readable. Use null for anything not present or unreadable; never invent a value to fill a slot.

Reading rules:
- Digits: convert Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Persian/Kurdish (۰۱۲۳۴۵۶۷۸۹) numerals to plain Western digits. Read amounts as plain numbers WITHOUT thousands separators or currency symbols (e.g. "850,000 د.ع" -> 850000).
- Amount magnitude: read every digit of an amount; do NOT drop or add trailing zeros. IQD amounts are almost always in the thousands (e.g. 36,000 / 850,000), so a bare "85" or "1" for an IQD total is almost certainly a misread — recount the zeros. A USD amount is usually a small round number.
- Orientation: the photo may be rotated 90/180 degrees or skewed. Read it regardless; do not lower confidence only because it is rotated.
- Handwriting: Kurdish/Arabic handwriting is common. Do your best and reflect uncertainty in the confidence, not by omitting the field.
- Crossed-out / struck-through LINES: treat as cancelled. Ignore them for totals and do not list them as line items.
- Struck-through CURRENCY headers: if a printed currency (e.g. "USD") is crossed out and another (e.g. "IQD") written in, trust the corrected/handwritten currency and lower the currency confidence.
- Currency detection: decide the currency of the WHOLE document from its strongest cue. A "$" symbol, a ticked/checked "$"/USD box, or the word "دۆلار"/"دولار" means USD; "دینار"/"د.ع"/"IQD"/"دینار عراقی" means IQD. A small round amount written next to "$" (e.g. "1,000 $") is USD dollars, not thousands of dinars. Use "mixed" only when the price is in one currency and payment in another (below).
- Reference numbers: copy invoice / voucher / order / reference numbers CHARACTER BY CHARACTER, preserving every digit and separator (e.g. "INV/2026/084298" — do not drop the final digit).
- Amounts in words: if the total (or any amount) is ALSO written in words (Arabic/Kurdish/English), the WORDS ARE AUTHORITATIVE — set "total" from the words. If the words and the digits disagree, still use the words for total, keep the digit reading in "notes", and add a flag { "code": "amount_in_words_mismatch", ... } describing both.
- "Paid in full" / "واصل" / "واصل كامل" / "تسدید" style notes: set paid_amount = total and remaining = 0, and record the note text in notes.
- Dates: output ISO YYYY-MM-DD. Day/month order in the region is usually DD/MM. Read the day and month FROM THE DOCUMENT. Use the current date given in the request ONLY to resolve the YEAR — never copy today's month or day. If the printed year is 2-digit, expand it against the current year. If the year is missing entirely, use the current year and add a flag { "code": "date_year_missing" }. If you cannot read the day and month, set date to null and add { "code": "date_uncertain" } — do NOT substitute today's date. If the date is ambiguous (e.g. the 8th vs 18th, or 3rd vs 8th month), pick the more likely reading, lower confidence, and add { "code": "date_uncertain" }.
- Document type: "voucher" is a slip headed سەند / وصل / "voucher" carrying a voucher number (common for furniture stores). "payment_receipt" is specifically a receipt confirming a payment (headed "Payment Receipt" / "وصل قبض" against an invoice). "invoice" (فاتورة/پسووڵە) itemises goods with a total. "receipt" is a point-of-sale till slip. Choose the closest; use "unknown" only if truly unclear.
- Line items: capture description, qty, and unit_price exactly as printed. A quantity may be fractional (e.g. 0.5 kg). For line_total: if the row has an explicit line-total/amount column, use it; if the row shows only a unit price and a quantity, set line_total = unit_price × qty.
- vendor: the business/shop name as printed. vendor_latin: the same name transliterated to Latin script (English spelling); if the name is already Latin, repeat it; null if you cannot read it.

Conflicts: when two figures cannot both be true (e.g. a total shown as "$10" and also "15,000 IQD" with no exchange note, or a stated total that does not match the line items), DO NOT guess a reconciliation. Record both readings faithfully and add a flag (code "currency_conflict" or "total_mismatch") describing the conflict. Lower the confidence of the affected fields.

For an IQD amount handed over against a USD price: set currency="mixed", total in the price currency, paid_amount in the currency actually paid, and paid_currency accordingly.

language: the dominant language of the document ("ar", "ckb", "en", or a mix like "ar+en").`;

/** Build the user prompt, embedding the reference date for year resolution. */
export function buildUserPrompt(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const year = iso.slice(0, 4);
  return `Today's date is ${iso}; the current year is ${year}. Use this ONLY to resolve a 2-digit or missing YEAR — never copy today's month or day onto the document's date.

Extract this document into the exact JSON object below. Respond with JSON only.

${OUTPUT_SHAPE}`;
}

// Static fallback (current date) for callers that don't build their own.
export const USER_PROMPT = buildUserPrompt();
