import React from 'react';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { RevenuesReportPDF } from '../src/features/pdf/RevenuesReportPDF.tsx';
import { ExpensesReportPDF } from '../src/features/pdf/ExpensesReportPDF.tsx';

console.log('--- Testing RevenuesReportPDF & ExpensesReportPDF Rendering ---');

const sampleTransactions = [
  {
    id: 'tx-1',
    number: 101,
    tx_date: '2026-07-15',
    kind: 'REVENUE',
    amount: 7500,
    currency: 'LYD',
    method: 'CASH',
    description: 'تحصيل إيجار شهر يوليو محل 101',
    contact: { id: 'c-1', name: 'محل الأصالة', kind: 'TENANT' },
    category: { id: 'cat-1', name_ar: 'إيجارات المحلات', code: 'RENT' },
    cashbox: { id: 'cb-1', name_ar: 'الخزينة الرئيسية', code: 'CASH-MAIN' },
  },
  {
    id: 'tx-2',
    number: 102,
    tx_date: '2026-07-18',
    kind: 'REVENUE',
    amount: 3200,
    currency: 'LYD',
    method: 'CARD',
    description: 'رسوم خدمات وصيانة دورية',
    contact: { id: 'c-2', name: 'محل النور', kind: 'TENANT' },
    category: { id: 'cat-2', name_ar: 'خدمات وصيانة', code: 'SERV' },
    cashbox: { id: 'cb-2', name_ar: 'مصرف الجمهورية', code: 'BANK-01' },
  },
];

async function testPdfRender() {
  console.log('1. Rendering RevenuesReportPDF with minimal props (simulating Dialog call)...');
  const blob1 = await renderPdfBlob(async () =>
    React.createElement(RevenuesReportPDF, {
      titleAr: 'كشف الإيرادات التفصيلي',
      subtitleAr: 'كامل المدة المسجلة · كافة بنود الإيرادات',
      rows: sampleTransactions,
      groupByPaymentMethod: true,
      includeSummaries: true,
      periodLabel: 'كامل المدة المسجلة',
      categoriesLabel: 'كافة بنود الإيرادات',
    })
  );
  console.log(`✓ RevenuesReportPDF rendered successfully! Size: ${blob1.size} bytes`);

  console.log('2. Rendering ExpensesReportPDF with minimal props (simulating Dialog call)...');
  const blob2 = await renderPdfBlob(async () =>
    React.createElement(ExpensesReportPDF, {
      titleAr: 'كشف المصروفات التفصيلي',
      subtitleAr: 'كامل المدة المسجلة · كافة بنود المصروفات',
      rows: sampleTransactions.map(t => ({ ...t, kind: 'EXPENSE' })),
      groupByPaymentMethod: true,
      includeSummaries: true,
      periodLabel: 'كامل المدة المسجلة',
      categoriesLabel: 'كافة بنود المصروفات',
    })
  );
  console.log(`✓ ExpensesReportPDF rendered successfully! Size: ${blob2.size} bytes`);

  console.log('\n✓ BOTH REVENUES AND EXPENSES PDFS PASSED WITH ZERO ERRORS!');
}

testPdfRender().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});

