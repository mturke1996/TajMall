import React from 'react';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { PeriodJournalExecutivePDF } from '../src/features/pdf/PeriodJournalExecutivePDF.tsx';


const mockBankGroups = [
  {
    cashboxId: 'cash-1',
    name: 'الخزينة النقدية الرئيسية',
    kind: 'CASH',
    totalDebit: 15400,
    totalCredit: 15400,
    entryCount: 4,
    focusLineName: 'إيراد إيجار المحلات التجارية',
    focusLineCode: 'REV-RNT',
    focusAmount: 15400,
    contraLineName: 'الخزينة النقدية الرئيسية',
    contraAmount: 15400,
    isCredit: true,
    items: [
      { id: '1', number: 101, date: '2026-07-05', description: 'إيجار شهر مايو المتأخر', tenantName: 'مستأجر محل العطور', shopNumber: '12', targetRentMonth: 'مايو 2026', targetMonthStatus: 'PRIOR', debit: 0, credit: 3500, amount: 3500 },
      { id: '2', number: 102, date: '2026-07-10', description: 'إيجار شهر يوليو الحالي', tenantName: 'مستأجر محل الساعات', shopNumber: '15', targetRentMonth: 'يوليو 2026', targetMonthStatus: 'CURRENT', debit: 0, credit: 4200, amount: 4200 },
      { id: '3', number: 103, date: '2026-07-15', description: 'إيجار شهر يوليو الحالي', tenantName: 'مستأجر كافيه النخبة', shopNumber: '02', targetRentMonth: 'يوليو 2026', targetMonthStatus: 'CURRENT', debit: 0, credit: 5000, amount: 5000 },
      { id: '4', number: 104, date: '2026-07-22', description: 'دفعة إيجار مقدم شهر أغسطس', tenantName: 'مستأجر الصيدلية', shopNumber: '01', targetRentMonth: 'أغسطس 2026', targetMonthStatus: 'FUTURE', debit: 0, credit: 2700, amount: 2700 }
    ]
  },
  {
    cashboxId: 'bank-1',
    name: 'مصرف الجمهورية — حساب المول (LYD)',
    kind: 'BANK',
    totalDebit: 28000,
    totalCredit: 28000,
    entryCount: 2,
    focusLineName: 'إيراد إيجار المحلات التجارية',
    focusLineCode: 'REV-RNT',
    focusAmount: 28000,
    contraLineName: 'مصرف الجمهورية',
    contraAmount: 28000,
    isCredit: true,
    items: [
      { id: '5', number: 105, date: '2026-07-02', description: 'حوالة إيجار شهر يوليو', tenantName: 'مستأجر الهايبر ماركت', shopNumber: '00', targetRentMonth: 'يوليو 2026', targetMonthStatus: 'CURRENT', debit: 0, credit: 20000, amount: 20000 },
      { id: '6', number: 106, date: '2026-07-18', description: 'حوالة إيجار شهر مايو المتأخر', tenantName: 'مستأجر معرض المفروشات', shopNumber: '25', targetRentMonth: 'مايو 2026', targetMonthStatus: 'PRIOR', debit: 0, credit: 8000, amount: 8000 }
    ]
  }
];

async function run() {
  const blob1 = await renderPdfBlob(async () =>
    React.createElement(PeriodJournalExecutivePDF, {
      titleAr: 'قيد الفترة المحاسبي المعتمد',
      periodLabel: 'شهر يوليو 2026',
      categoryLabel: 'REV-RNT إيراد إيجار المحلات التجارية',
      basisLabel: 'التحصيل الفعلي بالدفاتر (شهر يوليو)',
      viewLevel: 'SUMMARY_ONLY',
      grandTotal: 43400,
      totalEntries: 6,
      priorPeriodTotal: 11500,
      priorPeriodCount: 2,
      currentPeriodTotal: 29200,
      currentPeriodCount: 3,
      futurePeriodTotal: 2700,
      futurePeriodCount: 1,
      bankGroups: mockBankGroups,
    }),
  );
  console.log('✓ Summary PDF generated successfully, size:', blob1.size, 'bytes');

  const blob2 = await renderPdfBlob(async () =>
    React.createElement(PeriodJournalExecutivePDF, {
      titleAr: 'قيد الفترة المحاسبي المعتمد',
      periodLabel: 'شهر يوليو 2026',
      categoryLabel: 'REV-RNT إيراد إيجار المحلات التجارية',
      basisLabel: 'التحصيل الفعلي بالدفاتر (شهر يوليو)',
      viewLevel: 'DETAILED',
      grandTotal: 43400,
      totalEntries: 6,
      priorPeriodTotal: 11500,
      priorPeriodCount: 2,
      currentPeriodTotal: 29200,
      currentPeriodCount: 3,
      futurePeriodTotal: 2700,
      futurePeriodCount: 1,
      bankGroups: mockBankGroups,
    }),
  );
  console.log('✓ Detailed PDF generated successfully, size:', blob2.size, 'bytes');
}

run();

