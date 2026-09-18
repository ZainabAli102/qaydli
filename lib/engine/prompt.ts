// The vision prompt. It is provider-agnostic: adapters send SYSTEM_PROMPT and
// USER_PROMPT alongside the image and must return the exact JSON shape below.
// The maths are NOT trusted to the model — code re-checks them afterwards.

export const OUTPUT_SHAPE = `{
  "document_type": { "value": "invoice|receipt|payment_receipt|voucher|unknown", "confidence": 0-1 },
  "vendor":        { "value": "string|null", "confidence": 0-1 },
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
- Orientation: the photo may be rotated 90/180 degrees or skewed. Read it regardless; do not lower confidence only because it is rotated.
- Handwriting: Kurdish/Arabic handwriting is common. Do your best and reflect uncertainty in the confidence, not by omitting the field.
- Crossed-out / struck-through LINES: treat as cancelled. Ignore them for totals and do not list them as line items.
- Struck-through CURRENCY headers: if a printed currency (e.g. "USD") is crossed out and another (e.g. "IQD") written in, trust the corrected/handwritten currency and lower the currency confidence.
- Amounts in words: if the total (or any amount) is also written in words (Arabic/Kurdish/English), read the words too and use them to confirm the digits. Put the words in notes if they disagree with the figures.
- "Paid in full" / "واصل" / "تسدید" style notes: set paid_amount = total and remaining = 0, and record the note text in notes.
- Currency: use "IQD" or "USD" when the whole document is one currency. Use "mixed" when the price is in one currency and payment in another (e.g. a USD price with IQD handed over). In that case set currency="mixed", total in the price currency, paid_amount in the currency actually paid, and paid_currency accordingly.
- Dates: output ISO YYYY-MM-DD. Day/month order in the region is usually DD/MM. If the year is missing, still give month and day with a low-confidence best-guess year and add a flag "date_year_missing". If the date itself is ambiguous (e.g. could be the 8th or 18th), pick the more likely reading, lower confidence, and add a flag "date_uncertain".
- Line items: capture description, qty, unit_price, line_total. A quantity may be fractional (e.g. 0.5 kg). A price column is usually the UNIT price; compute nothing yourself — just report what is printed.

Conflicts: when two figures cannot both be true (e.g. a total shown as "$10" and also "15,000 IQD" with no exchange note, or a stated total that does not match the line items), DO NOT guess a reconciliation. Record both readings faithfully and add a flag (code "currency_conflict" or "total_mismatch") describing the conflict. Lower the confidence of the affected fields.

language: the dominant language of the document ("ar", "ckb", "en", or a mix like "ar+en").`;

export const USER_PROMPT = `Extract this document into the exact JSON object below. Respond with JSON only.

${OUTPUT_SHAPE}`;
