/**
 * Professional accounting checks for period journal report.
 */
import assert from 'node:assert/strict';
import {
  aggregatePeriodJournalLines,
  applyPeriodJournalCategoryFilter,
  buildCashBankSeparatedSections,
  buildPeriodJournalEntryModel,
  buildPeriodJournalVouchers,
  describePeriodJournalSectionDisplay,
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
    cashbox_id: null,
    cashbox_name_ar: null,
    cashbox_code: null,
    cashbox_kind: null,
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

// --- Case 5: عند اختيار بند — فصل النقدي عن كل مصرف ---
{
  const jCash = journal('jc', 501, '2026-07-05', 'صرف نقدي');
  const jBank1 = journal('jb1', 502, '2026-07-06', 'صرف مصرف الجمهورية');
  const jBank2 = journal('jb2', 503, '2026-07-07', 'صرف مصرف الواحة');

  const raw = [
    line({
      journal_id: 'jc',
      category_id: 'exp-clean',
      debit: 100,
      credit: 0,
      category_code: '5100',
      category_name: 'مصروف نظافة',
      category_type: 'EXPENSE',
    }),
    line({
      journal_id: 'jc',
      category_id: 'ast-csh',
      debit: 0,
      credit: 100,
      category_code: 'AST-CSH',
      category_name: 'الأصول - الخزائن والبنوك',
      category_type: 'ASSET',
      cashbox_id: 'cb-cash',
      cashbox_name_ar: 'الخزينة النقدية',
      cashbox_code: 'CASH',
      cashbox_kind: 'CASH',
    }),
    line({
      journal_id: 'jb1',
      category_id: 'exp-clean',
      debit: 250,
      credit: 0,
      category_code: '5100',
      category_name: 'مصروف نظافة',
      category_type: 'EXPENSE',
    }),
    line({
      journal_id: 'jb1',
      category_id: 'ast-csh',
      debit: 0,
      credit: 250,
      category_code: 'AST-CSH',
      category_name: 'الأصول - الخزائن والبنوك',
      category_type: 'ASSET',
      cashbox_id: 'cb-jum',
      cashbox_name_ar: 'مصرف الجمهورية',
      cashbox_code: 'BNK-JUM',
      cashbox_kind: 'BANK',
    }),
    line({
      journal_id: 'jb2',
      category_id: 'exp-clean',
      debit: 75,
      credit: 0,
      category_code: '5100',
      category_name: 'مصروف نظافة',
      category_type: 'EXPENSE',
    }),
    line({
      journal_id: 'jb2',
      category_id: 'ast-csh',
      debit: 0,
      credit: 75,
      category_code: 'AST-CSH',
      category_name: 'الأصول - الخزائن والبنوك',
      category_type: 'ASSET',
      cashbox_id: 'cb-wha',
      cashbox_name_ar: 'مصرف الواحة',
      cashbox_code: 'BNK-WHA',
      cashbox_kind: 'BANK',
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [jCash, jBank1, jBank2],
    lines: raw,
    statusFilter: 'POSTED',
  });

  const focused = applyPeriodJournalCategoryFilter(model, 'exp-clean');
  const sections = buildCashBankSeparatedSections(focused, 'exp-clean');

  assert.equal(sections.length, 3, 'نقدي + مصرفان');
  assert.equal(sections[0].sectionKind, 'CASH');
  assert.equal(sections[0].title, 'مصروف نظافة', 'اسم البند المحدد كعنوان');
  assert.equal(sections[0].fundingLabel, 'الخزينة النقدية');
  assert.equal(sections[0].focusLine.category_name, 'مصروف نظافة');
  assert.equal(sections[0].focusLine.cashbox_name, null, 'لا يُخفى اسم البند باسم الخزينة');
  assert.equal(sections[0].focusLine.debit, 100);
  assert.ok(sections[0].balanced);
  assert.equal(sections[0].totalDebit, sections[0].totalCredit);

  assert.equal(sections[1].sectionKind, 'BANK');
  assert.equal(sections[2].sectionKind, 'BANK');
  assert.ok(sections.every((s) => s.title === 'مصروف نظافة'));
  const bankLabels = sections
    .filter((s) => s.sectionKind === 'BANK')
    .map((s) => s.fundingLabel)
    .sort((a, b) => a.localeCompare(b, 'ar'));
  assert.deepEqual(bankLabels, ['مصرف الجمهورية', 'مصرف الواحة']);

  const jum = sections.find((s) => s.fundingLabel === 'مصرف الجمهورية');
  assert.equal(jum.focusLine.debit, 250);
  assert.equal(jum.focusLine.category_name, 'مصروف نظافة');
  assert.ok(jum.balanced);

  const wha = sections.find((s) => s.fundingLabel === 'مصرف الواحة');
  assert.equal(wha.focusLine.debit, 75);
  assert.ok(wha.balanced);
}

// --- Case 6: بند الخزائن نفسه — دمج النقدي وفصل المصارف ---
{
  const j1 = journal('j6a', 601, '2026-07-08', 'حركة نقد');
  const j2 = journal('j6b', 602, '2026-07-09', 'حركة مصرف');

  const raw = [
    line({
      journal_id: 'j6a',
      category_id: 'ast-csh',
      debit: 200,
      credit: 0,
      category_code: 'AST-CSH',
      category_name: 'الأصول - الخزائن والبنوك',
      category_type: 'ASSET',
      cashbox_id: 'cb-cash',
      cashbox_name_ar: 'الخزينة النقدية',
      cashbox_code: 'CASH',
      cashbox_kind: 'CASH',
    }),
    line({
      journal_id: 'j6a',
      category_id: 'rev',
      debit: 0,
      credit: 200,
      category_code: '4100',
      category_name: 'إيراد',
      category_type: 'REVENUE',
    }),
    line({
      journal_id: 'j6b',
      category_id: 'ast-csh',
      debit: 400,
      credit: 0,
      category_code: 'AST-CSH',
      category_name: 'الأصول - الخزائن والبنوك',
      category_type: 'ASSET',
      cashbox_id: 'cb-jum',
      cashbox_name_ar: 'مصرف الجمهورية',
      cashbox_code: 'BNK-JUM',
      cashbox_kind: 'BANK',
    }),
    line({
      journal_id: 'j6b',
      category_id: 'rev',
      debit: 0,
      credit: 400,
      category_code: '4100',
      category_name: 'إيراد',
      category_type: 'REVENUE',
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [j1, j2],
    lines: raw,
    statusFilter: 'POSTED',
  });

  const focused = applyPeriodJournalCategoryFilter(model, 'ast-csh');
  const sections = buildCashBankSeparatedSections(focused, 'ast-csh');

  assert.equal(sections.length, 2);
  assert.equal(sections[0].sectionKind, 'CASH');
  assert.equal(sections[0].title, 'الأصول - الخزائن والبنوك');
  assert.equal(sections[0].fundingLabel, 'الخزينة النقدية');
  assert.equal(sections[0].focusLine.category_name, 'الأصول - الخزائن والبنوك');
  assert.equal(sections[0].focusLine.debit, 200);
  assert.equal(sections[1].sectionKind, 'BANK');
  assert.equal(sections[1].fundingLabel, 'مصرف الجمهورية');
  assert.equal(sections[1].title, 'الأصول - الخزائن والبنوك');
  assert.equal(sections[1].focusLine.debit, 400);
}

// --- Case 7: group revenues together and expenses together ---
{
  const jRev = journal('j-rev', 701, '2026-07-10', 'إيراد إيجار');
  const jExp1 = journal('j-exp1', 702, '2026-07-11', 'ماء');
  const jExp2 = journal('j-exp2', 703, '2026-07-12', 'كهرباء');
  const raw = [
    line({
      journal_id: 'j-rev',
      category_id: 'cash-main',
      debit: 2000,
      credit: 0,
      category_code: '1100',
      category_name: 'الخزينة الرئيسية',
      category_type: 'ASSET',
      cashbox_id: 'cb1',
      cashbox_name_ar: 'الخزينة الرئيسية',
    }),
    line({
      journal_id: 'j-rev',
      category_id: 'rev-rent',
      debit: 0,
      credit: 2000,
      category_code: '4100',
      category_name: 'إيراد إيجار',
      category_type: 'REVENUE',
    }),
    line({
      journal_id: 'j-exp1',
      category_id: 'exp-water',
      debit: 300,
      credit: 0,
      category_code: '5200',
      category_name: 'مصروف ماء',
      category_type: 'EXPENSE',
    }),
    line({
      journal_id: 'j-exp1',
      category_id: 'cash-main',
      debit: 0,
      credit: 300,
      category_code: '1100',
      category_name: 'الخزينة الرئيسية',
      category_type: 'ASSET',
      cashbox_id: 'cb1',
      cashbox_name_ar: 'الخزينة الرئيسية',
    }),
    line({
      journal_id: 'j-exp2',
      category_id: 'exp-power',
      debit: 700,
      credit: 0,
      category_code: '5210',
      category_name: 'مصروف كهرباء',
      category_type: 'EXPENSE',
    }),
    line({
      journal_id: 'j-exp2',
      category_id: 'cash-main',
      debit: 0,
      credit: 700,
      category_code: '1100',
      category_name: 'الخزينة الرئيسية',
      category_type: 'ASSET',
      cashbox_id: 'cb1',
      cashbox_name_ar: 'الخزينة الرئيسية',
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [jRev, jExp1, jExp2],
    lines: raw,
    statusFilter: 'POSTED',
  });

  const grouped = applyPeriodJournalCategoryFilter(model, 'group:type');
  assert.ok(grouped.typeGroupFilter?.mode === 'group');
  assert.ok(grouped.balanced);
  assert.equal(grouped.totalDebit, grouped.totalCredit);

  const revAgg = grouped.lines.find((l) => l.category_type === 'REVENUE');
  const expAgg = grouped.lines.find((l) => l.category_type === 'EXPENSE');
  assert.ok(revAgg, 'must have aggregated revenue row');
  assert.ok(expAgg, 'must have aggregated expense row');
  assert.equal(revAgg.category_name, 'جميع الإيرادات');
  assert.equal(expAgg.category_name, 'جميع المصاريف');
  assert.equal(revAgg.credit, 2000);
  assert.equal(expAgg.debit, 1000, 'water 300 + power 700');
  assert.equal(
    grouped.lines.filter((l) => l.category_type === 'REVENUE').length,
    1,
  );
  assert.equal(
    grouped.lines.filter((l) => l.category_type === 'EXPENSE').length,
    1,
  );

  const allExpenses = applyPeriodJournalCategoryFilter(model, 'type:EXPENSE');
  assert.ok(allExpenses.typeGroupFilter?.mode === 'type');
  assert.equal(allExpenses.categoryFilter?.name_ar, 'جميع المصاريف');
  const focusExp = allExpenses.lines.find(
    (l) => l.category_id === 'type:EXPENSE',
  );
  assert.ok(focusExp, 'صف مجموع واحد لجميع المصاريف');
  assert.equal(focusExp.category_name, 'جميع المصاريف');
  assert.equal(focusExp.debit, 1000);
  assert.equal(
    allExpenses.lines.filter((l) => l.category_type === 'EXPENSE').length,
    1,
    'مجموع فقط بلا تفصيل البنود',
  );
  assert.ok(allExpenses.balanced);
  assert.equal(allExpenses.totalDebit, 1000);
  assert.equal(allExpenses.totalCredit, 1000);

  const expenseSections = buildCashBankSeparatedSections(
    allExpenses,
    'type:EXPENSE',
  );
  assert.ok(expenseSections.length >= 1);
  for (const section of expenseSections) {
    assert.equal(section.title, 'جميع المصاريف');
    assert.equal(section.focusLine.category_name, 'جميع المصاريف');
    assert.ok(
      !section.focusDetailLines || section.focusDetailLines.length === 0,
      'بدون تفاصيل البنود — مجموع فقط',
    );
    assert.ok(section.balanced, `section ${section.fundingLabel} must balance`);
  }

  const allRevenue = applyPeriodJournalCategoryFilter(model, 'type:REVENUE');
  const focusRev = allRevenue.lines.find(
    (l) => l.category_id === 'type:REVENUE',
  );
  assert.ok(focusRev);
  assert.equal(focusRev.credit, 2000);
  assert.ok(allRevenue.balanced);
}

// --- Case 8: إيجارات المحلات (REV-RNT) — استحقاق: مدين ذمم / دائن إيراد ---
// كان العرض يفترض شكل المصروف فيظهر 0/0 بدل مبلغ الإيجار.
{
  const jCharge = journal('j-rent-accrual', 801, '2026-07-15', 'إيجار شهر 2026-07');
  const raw = [
    line({
      journal_id: 'j-rent-accrual',
      category_id: 'ast-rec',
      debit: 3500,
      credit: 0,
      category_code: 'AST-REC',
      category_name: 'ذمم المستأجرين',
      category_type: 'ASSET',
      contact_name: 'مستأجر تجريبي',
    }),
    line({
      journal_id: 'j-rent-accrual',
      category_id: 'rev-rnt',
      debit: 0,
      credit: 3500,
      category_code: 'REV-RNT',
      category_name: 'إيجارات المحلات والوحدات',
      category_type: 'REVENUE',
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [jCharge],
    lines: raw,
    statusFilter: 'POSTED',
  });

  const focused = applyPeriodJournalCategoryFilter(model, 'rev-rnt');
  assert.ok(focused.balanced);
  const rent = focused.lines.find((l) => l.category_id === 'rev-rnt');
  assert.ok(rent);
  assert.equal(rent.credit, 3500);
  assert.equal(rent.debit, 0);

  const sections = buildCashBankSeparatedSections(focused, 'rev-rnt');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].focusLine.credit, 3500);
  assert.equal(sections[0].focusLine.debit, 0);
  assert.ok(sections[0].balanced);
  assert.match(sections[0].subtitle, /دائن: إيجارات المحلات والوحدات/);
  assert.match(sections[0].subtitle, /مدين:/);

  const display = describePeriodJournalSectionDisplay(
    sections[0].focusLine,
    sections[0].contraLines,
    {
      fundingLabel: sections[0].fundingLabel,
      sectionKind: sections[0].sectionKind,
      focusTitle: sections[0].title,
    },
  );
  assert.equal(display.focusIsCredit, true);
  assert.equal(display.focusAmount, 3500, 'يجب إظهار مبلغ الإيجار لا صفر');
  assert.equal(display.contraAmount, 3500);
  assert.equal(display.focusSideLabel, 'دائن');
  assert.equal(display.contraSideLabel, 'مدين');
  assert.equal(display.contraLabel, 'ذمم المستأجرين');
  assert.notEqual(
    display.focusAmount,
    0,
    'regression: إيراد الإيجار لا يُعرض كمدين=0',
  );
}

// --- Case 9: بند الإيجار يجب أن يجمع كل قيود الاستحقاق لا عينة صغيرة ---
{
  const journals = [];
  const raw = [];
  let expected = 0;
  for (let i = 1; i <= 40; i++) {
    const id = `j-rent-${i}`;
    const amount = 1000 + i;
    expected += amount;
    journals.push(journal(id, 900 + i, '2026-07-01', `إيجار وحدة ${i}`));
    raw.push(
      line({
        journal_id: id,
        category_id: 'ast-rec',
        debit: amount,
        credit: 0,
        category_code: 'AST-REC',
        category_name: 'ذمم المستأجرين',
        category_type: 'ASSET',
      }),
      line({
        journal_id: id,
        category_id: 'rev-rnt',
        debit: 0,
        credit: amount,
        category_code: 'REV-RNT',
        category_name: 'إيجارات المحلات والوحدات',
        category_type: 'REVENUE',
      }),
    );
  }

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: journals,
    lines: raw,
    statusFilter: 'POSTED',
  });

  const focused = applyPeriodJournalCategoryFilter(model, 'rev-rnt');
  const rent = focused.lines.find((l) => l.category_id === 'rev-rnt');
  assert.ok(rent);
  assert.equal(rent.credit, expected, 'يجب جمع كل مطالبات الإيجار لا جزء منها');
  assert.equal(focused.sourceEntryCount, 40);

  const sections = buildCashBankSeparatedSections(focused, 'rev-rnt');
  const display = describePeriodJournalSectionDisplay(
    sections[0].focusLine,
    sections[0].contraLines,
    {
      fundingLabel: sections[0].fundingLabel,
      sectionKind: sections[0].sectionKind,
      focusTitle: sections[0].title,
    },
  );
  assert.equal(display.focusAmount, expected);
  assert.ok(expected > 6000, 'sanity: المجموع أكبر من عينة 6000');
}

// --- Case 10: تحصيل إيجار — خزينة/مصرف منفصل (القيد: مدين نقد + دائن ذمم) ---
{
  const jAccrual = journal('j-accrual', 900, '2026-07-01', 'استحقاق');
  const jCash = journal('j-collect-cash', 901, '2026-07-05', 'تحصيل نقدي');
  const jBank = journal('j-collect-bank', 902, '2026-07-06', 'تحصيل مصرف');
  const raw = [
    line({
      journal_id: 'j-accrual',
      category_id: 'ast-rec',
      debit: 5000,
      credit: 0,
      category_code: 'AST-REC',
      category_name: 'ذمم المستأجرين',
      category_type: 'ASSET',
    }),
    line({
      journal_id: 'j-accrual',
      category_id: 'rev-rnt',
      debit: 0,
      credit: 5000,
      category_code: 'REV-RNT',
      category_name: 'إيجارات المحلات والوحدات',
      category_type: 'REVENUE',
    }),
    line({
      journal_id: 'j-collect-cash',
      category_id: 'ast-csh',
      debit: 2000,
      credit: 0,
      category_code: 'AST-CSH',
      category_name: 'النقدية',
      category_type: 'ASSET',
      cashbox_id: 'cb-cash',
      cashbox_name_ar: 'الخزينة النقدية',
      cashbox_code: 'CASH',
      cashbox_kind: 'CASH',
    }),
    line({
      journal_id: 'j-collect-cash',
      category_id: 'ast-rec',
      debit: 0,
      credit: 2000,
      category_code: 'AST-REC',
      category_name: 'ذمم المستأجرين',
      category_type: 'ASSET',
    }),
    line({
      journal_id: 'j-collect-bank',
      category_id: 'ast-csh',
      debit: 3000,
      credit: 0,
      category_code: 'AST-CSH',
      category_name: 'النقدية',
      category_type: 'ASSET',
      cashbox_id: 'cb-bank',
      cashbox_name_ar: 'مصرف شمال افريقيا',
      cashbox_code: 'BNK-NAB',
      cashbox_kind: 'BANK',
    }),
    line({
      journal_id: 'j-collect-bank',
      category_id: 'ast-rec',
      debit: 0,
      credit: 3000,
      category_code: 'AST-REC',
      category_name: 'ذمم المستأجرين',
      category_type: 'ASSET',
    }),
  ];

  const model = buildPeriodJournalEntryModel({
    period: { mode: 'month', year: 2026, month: 7 },
    entries: [jAccrual, jCash, jBank],
    lines: raw,
    statusFilter: 'POSTED',
  });

  const focused = applyPeriodJournalCategoryFilter(model, 'rev-rnt');
  assert.ok(
    focused.lines.some((l) => l.cashbox_id === 'cb-cash'),
    'must keep cashbox lines from rent collections',
  );

  const sections = buildCashBankSeparatedSections(focused, 'rev-rnt');
  const cashSection = sections.find((s) => s.fundingLabel === 'الخزينة النقدية');
  const bankSection = sections.find(
    (s) => s.fundingLabel === 'مصرف شمال افريقيا',
  );
  assert.ok(cashSection, 'cash collection section');
  assert.ok(bankSection, 'bank collection section');
  assert.equal(cashSection.sectionKind, 'CASH');
  assert.equal(bankSection.sectionKind, 'BANK');
  assert.equal(cashSection.focusLine.credit, 2000);
  assert.equal(bankSection.focusLine.credit, 3000);
  assert.ok(cashSection.balanced);
  assert.ok(bankSection.balanced);
}

console.log('OK — professional double-entry period journal checks passed');
