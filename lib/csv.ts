// CSV of a month's transactions (shared by /api/export and the receipts zip).
import type { TxnRow } from './queries';

const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function transactionsToCsv(txns: TxnRow[]): string {
  const header = [
    'date',
    'vendor',
    'type',
    'category',
    'payment_method',
    'amount_iqd',
    'original_amount',
    'original_currency',
    'notes',
  ];
  const rows = txns.map((t) =>
    [
      t.occurred_on ?? '',
      t.vendor ?? '',
      t.direction === 'in' ? 'income' : 'expense',
      t.category ?? '',
      t.payment_method ?? '',
      t.amount,
      t.original_amount ?? '',
      t.original_currency ?? '',
      t.notes ?? '',
    ]
      .map(esc)
      .join(',')
  );
  // BOM so Excel reads UTF-8 (Arabic/Kurdish) correctly.
  return '﻿' + [header.map(esc).join(','), ...rows].join('\r\n');
}
