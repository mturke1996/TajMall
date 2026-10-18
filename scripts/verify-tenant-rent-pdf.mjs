/**
 * تحقق من توليد PDF لتقرير المستأجرين مع بيانات فترة مجمّعة
 * التشغيل: npx tsx scripts/verify-tenant-rent-pdf.mjs
 */
import React from 'react';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { TenantsReportPDF } from '../src/features/pdf/TenantsReportPDF.tsx';
import {
  aggregateTenantSummariesForPeriod,
  buildTenantsReportPeriodContext,
  computeTenantPeriodStats,
  tenantPeriodExpectedRent,
  tenantPeriodPaid,
} from '../src/lib/tenant-rent-period.ts';

function row(id, rent, amount, paid, status) {
  return {
    id,
    name: `مستأجر ${id}`,
    shop_number: '12',
    floor: '1',
    monthly_rent: String(rent),
    phone: '0910000000',
    current_month_key: '2026-01',
    current_month_amount: amount == null ? null : String(amount),
    current_month_paid: String(paid),
    current_month_status: status,
    total_rent_paid: String(paid),
    rent_linked_journals_count: 1,
    journal_entries_count: 1,
    last_12_months_revenue: '0',
    total_balance: '0',
  };
}

const months = ['2026-01', '2026-02', '2026-03'];
const map = new Map([
  ['2026-01', [row('1', 1000, null, 1000, 'paid_full')]],
  ['2026-02', [row('1', 1000, '1000', 500, 'paid_partial')]],
  ['2026-03', [row('1', 1000, '1000', 0, 'unpaid')]],
]);

const tenants = aggregateTenantSummariesForPeriod(map, months);
const stats = computeTenantPeriodStats(tenants);
const t = tenants[0];

const uiExpected = stats.expectedTotal;
const uiCollected = stats.collectedTotal;
const pdfExpected = tenants.reduce((s, r) => s + tenantPeriodExpectedRent(r), 0);
const pdfCollected = tenants.reduce((s, r) => s + tenantPeriodPaid(r), 0);

if (uiExpected !== pdfExpected || uiCollected !== pdfCollected) {
  throw new Error(`PDF/UI mismatch expected ${uiExpected}/${pdfExpected} collected ${uiCollected}/${pdfCollected}`);
}

const blob = await renderPdfBlob(async () =>
  React.createElement(TenantsReportPDF, {
    titleAr: 'تقرير إيجارات المستأجرين',
    subtitleAr: `1 مستأجر · سنة 2026 (يناير – مارس 2026)`,
    rows: tenants,
    period: buildTenantsReportPeriodContext({ mode: 'year', year: 2026 }),
  }),
);

if (blob.size < 2000) {
  throw new Error(`PDF too small: ${blob.size} bytes`);
}

// Statement of account: renders for the whole account and for one year (with an opening balance).
const { buildTenantRentAccount } = await import('../src/lib/tenant-rent-account.ts');
const { buildTenantStatement } = await import('../src/lib/tenant-statement.ts');
const { TenantStatementPDF } = await import('../src/features/pdf/TenantStatementPDF.tsx');
const calMonths = (year, cells) =>
  Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { month, status: 'no_charge', amount: 0, paid: 0, charge_id: null, description: null, ...(cells[month] ?? {}) };
  });
const account = buildTenantRentAccount({
  calendars: [
    { year: 2025, tenant_id: 't', monthly_rent: 0, contract_id: null, months: calMonths(2025, { '2025-12': { status: 'partial', amount: 1500, paid: 750, charge_id: 'c1' } }) },
    { year: 2026, tenant_id: 't', monthly_rent: 0, contract_id: null, months: calMonths(2026, { '2026-01': { status: 'paid', amount: 1500, paid: 1500, charge_id: 'c2' } }) },
  ],
  pricing: { contactRent: 1500, bands: [], leaseRent: null },
  claimStart: '2025-12-01',
  now: '2026-03',
});
const receipts = [
  { id: 'r1', number: 41, tx_date: '2025-12-04', amount: 750, status: 'POSTED', kind: 'REVENUE', category: { code: 'REV-RNT' }, description: 'نصف إيجار ديسمبر' },
  { id: 'r2', number: 57, tx_date: '2026-01-03', amount: 1500, status: 'POSTED', kind: 'REVENUE', category: { code: 'REV-RNT' }, method: 'TRANSFER' },
];
for (const year of [null, 2026]) {
  const statement = buildTenantStatement({ account, receipts, unlinkedTotal: 0, year });
  // Dec half paid + Feb, Mar without a charge = 3,750 owed, whether the year opens with Dec's 750 or not
  const expectedClosing = 3750;
  if (statement.closing !== expectedClosing) throw new Error(`statement ${year ?? 'all'} closing ${statement.closing} ≠ ${expectedClosing}`);
  const sblob = await renderPdfBlob(async () =>
    React.createElement(TenantStatementPDF, {
      tenantName: 'مستأجر تجريبي',
      shopNumber: '12',
      phone: '0910000000',
      periodLabel: year == null ? 'كل الفترة' : `سنة ${year}`,
      issuedOn: '2026-03-15',
      statement,
    }),
  );
  if (sblob.size < 2000) throw new Error(`statement PDF too small: ${sblob.size} bytes`);
}

console.log(
  JSON.stringify({
    periodExpected: tenantPeriodExpectedRent(t),
    periodPaid: tenantPeriodPaid(t),
    status: t.current_month_status,
    pdfBytes: blob.size,
  }),
);
console.log('✓ verify-tenant-rent-pdf: PDF matches UI totals; statement PDF renders');
