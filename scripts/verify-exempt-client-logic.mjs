/**
 * تحقق منطقي محلي لأشهر بدون مطالبة (بدون متصفح)
 */
import {
  applyExemptOverlayToCalendarMonths,
  filterVisibleCalendarMonths,
  isCalendarMonthOutstanding,
  isRentMonthExempt,
  isBillableRentMonthStatus,
} from '../src/lib/rent-exempt-months.ts';
import { aggregateTenantSummariesForPeriod } from '../src/lib/tenant-rent-period.ts';

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

// 1) isRentMonthExempt
assert(
  isRentMonthExempt('2026-01', { claimStart: '2026-03-01' }),
  'Jan before claim should be exempt',
);
assert(
  !isRentMonthExempt('2026-03', { claimStart: '2026-03-01' }),
  'claim month itself not auto-exempt',
);
assert(
  isRentMonthExempt('2026-05', { manualExemptMonths: ['2026-05'] }),
  'manual exempt',
);

// 2) overlay + hide
const months = [
  { month: '2026-01', status: 'unpaid', amount: 1000, paid: 0, charge_id: null, description: null },
  { month: '2026-02', status: 'unpaid', amount: 1000, paid: 0, charge_id: null, description: null },
  { month: '2026-03', status: 'paid', amount: 1000, paid: 1000, charge_id: 'x', description: null },
  { month: '2026-04', status: 'no_charge', amount: 1000, paid: 0, charge_id: null, description: null },
];
const overlaid = applyExemptOverlayToCalendarMonths(months, {
  claimStart: '2026-03-01',
  manualExemptMonths: ['2026-04'],
});
assert(overlaid[0].status === 'exempt', 'Jan before claim → exempt');
assert(overlaid[1].status === 'exempt', 'Feb before claim → exempt');
assert(overlaid[2].status === 'paid', 'claim-start paid stays paid');
assert(overlaid[3].status === 'exempt', 'manual April → exempt');

const visible = filterVisibleCalendarMonths(overlaid);
assert(visible.length === 1 && visible[0].month === '2026-03', 'only March visible');
assert(!visible.some((m) => m.status === 'exempt'), 'no exempt in visible');
assert(
  !isCalendarMonthOutstanding(overlaid[0]),
  'exempt not outstanding',
);

// 3) period aggregation skips exempt amounts
const rowsByMonth = new Map([
  [
    '2026-01',
    [
      {
        id: 't1',
        name: 'A',
        shop_number: '1',
        floor: null,
        monthly_rent: '5000',
        phone: null,
        current_month_amount: '0',
        current_month_paid: '0',
        current_month_status: 'exempt',
        last_12_months_revenue: '0',
        total_balance: '0',
      },
    ],
  ],
  [
    '2026-02',
    [
      {
        id: 't1',
        name: 'A',
        shop_number: '1',
        floor: null,
        monthly_rent: '5000',
        phone: null,
        current_month_amount: '5000',
        current_month_paid: '0',
        current_month_status: 'unpaid',
        last_12_months_revenue: '0',
        total_balance: '0',
      },
    ],
  ],
]);
const agg = aggregateTenantSummariesForPeriod(rowsByMonth, ['2026-01', '2026-02']);
assert(agg.length === 1, 'one tenant');
assert(Number(agg[0].current_month_amount) === 5000, `expected 5000 got ${agg[0].current_month_amount}`);
assert(agg[0].current_month_status === 'unpaid', 'status unpaid for billable only');
assert(!isBillableRentMonthStatus('exempt'), 'exempt not billable');
assert(isBillableRentMonthStatus('unpaid'), 'unpaid billable');

console.log('✅ exempt client logic OK');
