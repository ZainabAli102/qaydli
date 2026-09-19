// Map a scanned invoice (engine ReceiptResult) into an invoice draft the owner
// confirms. Pure: types only, no I/O. The client is left blank for the owner to
// pick — a handwritten sales invoice names the buyer in free form, not reliably.

import type { ReceiptResult } from '@/lib/engine/types';
import type { ParsedInvoiceDraft } from '@/lib/invoice-parse';

export function receiptToDraft(r: ReceiptResult): ParsedInvoiceDraft {
  const items: ParsedInvoiceDraft['items'] = [];
  for (const li of r.line_items ?? []) {
    const qty = li.qty ?? 1;
    let unit = li.unit_price;
    if (unit == null && li.line_total != null && qty) unit = li.line_total / qty;
    if ((li.description ?? '') === '' && !unit) continue;
    items.push({
      description: li.description ?? '',
      qty: qty || 1,
      unit_price: unit ?? 0,
    });
  }
  // No usable line items but a total was read: fall back to one lump-sum line.
  if (items.length === 0 && r.total.value != null) {
    items.push({
      description: r.vendor.value ?? '',
      qty: 1,
      unit_price: r.total.value,
    });
  }

  const cur = r.currency.value;
  const currency = cur === 'USD' ? 'USD' : cur === 'IQD' ? 'IQD' : null;

  const noteParts = [r.vendor.value, r.notes.value].filter(Boolean) as string[];

  return {
    client_name: null,
    items,
    currency,
    due_in_days: null,
    due_date: null,
    notes: noteParts.length ? noteParts.join(' · ') : null,
  };
}
