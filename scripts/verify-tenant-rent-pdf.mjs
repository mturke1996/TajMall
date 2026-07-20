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

console.log(
  JSON.stringify({
    periodExpected: tenantPeriodExpectedRent(t),
    periodPaid: tenantPeriodPaid(t),
    status: t.current_month_status,
    pdfBytes: blob.size,
  }),
);
console.log('✓ verify-tenant-rent-pdf: PDF matches UI totals');
