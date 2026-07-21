/**
 * Professional accounting checks for period journal report.
 */
import assert from 'node:assert/strict';
import {
  aggregatePeriodJournalLines,
  applyPeriodJournalCategoryFilter,
  buildPeriodJournalEntryModel,
  buildPeriodJournalVouchers,
} from '../src/lib/period-journal-entry.ts';

function journal(id, number, date, description) {
  return {
    id,
    number,
    entry_date: date,
    reference: null,
    description,
    status: 'POSTED',
  };
}

function line(partial) {
  return {
    description: null,
    cashbox_name_ar: null,
    contact_name: null,
    sort_order: 1,
    ...partial,
  };
}

// --- Case 1: simple expense from cashbox ---
{
  const j1 = journal('j1', 101, '2026-07-01', 'صرف نظافة');
  const journals = new Map([['j1', j1]]);
  const raw = [
    line({
      journal_id: 'j1',
      category_id: 'exp-clean',
      debit: 500,
      credit: 0,
      description: 'نظافة يوليو',
      category_code: '5100',
      category_name: 'مصروف نظافة',
      category_type: 'EXPENSE',
      sort_order: 1,
    }),
    line({
      journal_id: 'j1',
      category_id: 'cash-main',
      debit: 0,
      credit: 500,
      category_code: '1100',
      category_name: 'الخزينة الرئيسية',
      category_type: 'ASSET',
      cashbox_name_ar: 'الخزينة الرئيسية',
      sort_order: 2,
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [j1],
    lines: raw,
    statusFilter: 'POSTED',
  });

  const focused = applyPeriodJournalCategoryFilter(model, 'exp-clean');
  assert.equal(focused.lines.length, 2);
  assert.ok(focused.balanced);
  assert.equal(focused.totalDebit, 500);
  assert.equal(focused.totalCredit, 500);

  const expense = focused.lines.find((l) => l.category_id === 'exp-clean');
  const cash = focused.lines.find((l) => l.category_id === 'cash-main');
  assert.equal(expense.debit, 500);
  assert.equal(expense.credit, 0, 'expense credit must stay 0 (true ledger)');
  assert.equal(cash.credit, 500, 'cashbox credit must appear on cashbox line');

  assert.equal(focused.vouchers.length, 1);
  const v = focused.vouchers[0];
  assert.ok(v.balanced);
  assert.equal(v.totalDebit, 500);
  assert.equal(v.totalCredit, 500);
  assert.equal(v.lines.length, 2);
  assert.ok(v.lines.some((l) => l.is_focus && l.debit === 500));
  assert.ok(v.lines.some((l) => !l.is_focus && l.credit === 500));
}

// --- Case 2: compound journal (two expenses + cash) ---
{
  const j2 = journal('j2', 202, '2026-07-02', 'صرف متعدد');
  const raw = [
    line({
      journal_id: 'j2',
      category_id: 'exp-a',
      debit: 300,
      credit: 0,
      category_code: '5110',
      category_name: 'مصروف أ',
      category_type: 'EXPENSE',
    }),
    line({
      journal_id: 'j2',
      category_id: 'exp-b',
      debit: 200,
      credit: 0,
      category_code: '5120',
      category_name: 'مصروف ب',
      category_type: 'EXPENSE',
    }),
    line({
      journal_id: 'j2',
      category_id: 'cash-main',
      debit: 0,
      credit: 500,
      category_code: '1100',
      category_name: 'الخزينة الرئيسية',
      category_type: 'ASSET',
      cashbox_name_ar: 'الخزينة الرئيسية',
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [j2],
    lines: raw,
    statusFilter: 'POSTED',
  });

  const focusedA = applyPeriodJournalCategoryFilter(model, 'exp-a');
  assert.equal(focusedA.lines.length, 3, 'must include A + B + cash from same voucher');
  assert.ok(focusedA.balanced);
  assert.equal(focusedA.totalDebit, 500);
  assert.equal(focusedA.totalCredit, 500);

  const expA = focusedA.lines.find((l) => l.category_id === 'exp-a');
  assert.equal(expA.debit, 300);
  assert.equal(expA.credit, 0, 'must NOT inject cash credit into expense A');

  const voucher = focusedA.vouchers[0];
  assert.equal(voucher.totalDebit, 500);
  assert.equal(voucher.totalCredit, 500);
}

// --- Case 3: comprehensive keeps per-account truth ---
{
  const j3 = journal('j3', 303, '2026-07-03', 'إيراد');
  const raw = [
    line({
      journal_id: 'j3',
      category_id: 'cash-main',
      debit: 1000,
      credit: 0,
      category_code: '1100',
      category_name: 'الخزينة الرئيسية',
      category_type: 'ASSET',
      cashbox_name_ar: 'الخزينة الرئيسية',
    }),
    line({
      journal_id: 'j3',
      category_id: 'rev-rent',
      debit: 0,
      credit: 1000,
      category_code: '4100',
      category_name: 'إيراد إيجار',
      category_type: 'REVENUE',
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [j3],
    lines: raw,
    statusFilter: 'POSTED',
  });
  const all = applyPeriodJournalCategoryFilter(model, 'all');
  assert.equal(all.vouchers.length, 0);
  assert.ok(all.balanced);
  const rev = all.lines.find((l) => l.category_id === 'rev-rent');
  assert.equal(rev.debit, 0);
  assert.equal(rev.credit, 1000);
  assert.ok(rev.movements[0].contra_label?.includes('الخزينة'));
}

// --- Case 4: vouchers helper ordering ---
{
  const lines = aggregatePeriodJournalLines(
    [
      line({
        journal_id: 'j4',
        category_id: 'cash',
        debit: 0,
        credit: 80,
        category_code: '1100',
        category_name: 'خزينة',
        category_type: 'ASSET',
      }),
      line({
        journal_id: 'j4',
        category_id: 'exp',
        debit: 80,
        credit: 0,
        category_code: '5200',
        category_name: 'مصروف',
        category_type: 'EXPENSE',
      }),
    ],
    new Map([['j4', journal('j4', 404, '2026-07-04', 'x')]]),
  );
  const vouchers = buildPeriodJournalVouchers(lines, 'exp');
  assert.equal(vouchers[0].lines[0].category_id, 'exp');
  assert.equal(vouchers[0].lines[0].is_focus, true);
}

console.log('OK — professional double-entry period journal checks passed');
