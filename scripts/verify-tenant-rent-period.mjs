/**
 * تحقق من منطق تجميع فترات إيجار المستأجرين + PDF helpers
 * التشغيل: node scripts/verify-tenant-rent-period.mjs
 */
import {
  aggregateTenantSummariesForPeriod,
  tenantPeriodExpectedRent,
  tenantPeriodPaid,
  computeTenantPeriodStats,
  filterTenantsByStatusAndSearch,
  getPeriodMonthKeys,
} from '../src/lib/tenant-rent-period.ts';

function row(id, rent, amount, paid, status, journals = 2) {
  return {
    id,
    name: id,
    shop_number: '1',
    floor: null,
    monthly_rent: String(rent),
    phone: null,
    current_month_key: '2026-01',
    current_month_amount: amount == null ? null : String(amount),
    current_month_paid: String(paid),
    current_month_status: status,
    total_rent_paid: String(paid),
    rent_linked_journals_count: journals,
    journal_entries_count: journals,
    last_12_months_revenue: '0',
    total_balance: '0',
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 1) شهر أول بدون current_month_amount — يجب استخدام monthly_rent
{
  const months = ['2026-01', '2026-02'];
  const map = new Map([
    ['2026-01', [row('t1', 1000, null, 500, 'paid_partial')]],
    ['2026-02', [row('t1', 1000, '1000', 1000, 'paid_full')]],
  ]);
  const [t] = aggregateTenantSummariesForPeriod(map, months);
  assert(tenantPeriodExpectedRent(t) === 2000, 'expected 2000');
  assert(tenantPeriodPaid(t) === 1500, 'paid 1500');
  assert(t.current_month_status === 'paid_partial', 'status partial');
  assert(t.rent_linked_journals_count === 2, 'journals not summed');
}

// 2) سنة = 12 شهر
assert(getPeriodMonthKeys({ mode: 'year', year: 2026 }).length === 12, 'year 12 months');

// 3) فلتر الحالة
{
  const tenants = [
    row('a', 100, '100', 100, 'paid_full'),
    row('b', 100, '100', 50, 'paid_partial'),
    row('c', 100, '100', 0, 'unpaid'),
  ];
  assert(filterTenantsByStatusAndSearch(tenants, 'paid_full', '').length === 1, 'filter paid');
  assert(filterTenantsByStatusAndSearch(tenants, 'ALL', 'b').length === 1, 'filter search');
  const stats = computeTenantPeriodStats(tenants);
  assert(stats.paid === 1 && stats.partial === 1 && stats.unpaid === 1, 'stats counts');
  assert(stats.expectedTotal === 300 && stats.collectedTotal === 150, 'stats totals');
}

// 4) PDF totals match stats for same rows
{
  const months = ['2026-04', '2026-05', '2026-06'];
  const map = new Map([
    ['2026-04', [row('x', 500, '500', 500, 'paid_full')]],
    ['2026-05', [row('x', 500, '500', 250, 'paid_partial')]],
    ['2026-06', [row('x', 500, '500', 0, 'unpaid')]],
  ]);
  const [t] = aggregateTenantSummariesForPeriod(map, months);
  assert(tenantPeriodExpectedRent(t) === 1500, 'quarter expected');
  assert(tenantPeriodPaid(t) === 750, 'quarter paid');
  assert(t.current_month_status === 'paid_partial', 'quarter status');
}

console.log('✓ verify-tenant-rent-period: all checks passed');
