/**
 * The owner's monthly report: cash figures, comparison with the month before, rent collection,
 * arrears, categories and the per-cashbox month.
 *   npx tsx scripts/verify-monthly-report.mjs
 */
import assert from 'node:assert/strict';

const { buildMonthlyReport, change, shiftMonth, monthBounds, isMonthKey, OTHER_KEY } = await import('../src/lib/monthly-report.ts');
const { buildMallOccupancy } = await import('../src/lib/mall-occupancy.ts');
const { buildContractExpiry } = await import('../src/lib/contract-expiry.ts');
const { addDaysISO } = await import('../src/lib/mall-dates.ts');
const { changePhrase, ratePhrase, pctText, monthName } = await import('../src/lib/monthly-report-text.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-18';
const MONTH = '2026-10';

// ── months ──────────────────────────────────────────────────────────────────
check('months move across a year and report their first and last day', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-10', -12), '2025-10');
  assert.deepEqual(monthBounds('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(monthBounds('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(monthBounds('2026-12'), { start: '2026-12-01', end: '2026-12-31' });
  assert.ok(isMonthKey('2026-10') && !isMonthKey('2026-13') && !isMonthKey('26-10') && !isMonthKey(null));
});
check('a change is the difference and a percentage only when there was something before', () => {
  assert.deepEqual(change(5000, 4000), { amount: 1000, pct: 25 });
  assert.deepEqual(change(1750, 1600), { amount: 150, pct: 9.4 });
  assert.deepEqual(change(300, 0), { amount: 300, pct: null });
  assert.deepEqual(change(0, 0), { amount: 0, pct: null });
  assert.deepEqual(change(-100, -200), { amount: 100, pct: 50 });
});

check('a comparison is worded, not signed, and its tone depends on whose good news it is', () => {
  assert.deepEqual(changePhrase({ amount: 1000, pct: 25 }, 'سبتمبر', 'up-is-good'), { text: 'أعلى بنسبة 25% من سبتمبر', tone: 'good' });
  assert.deepEqual(changePhrase({ amount: 150, pct: 9.4 }, 'سبتمبر', 'down-is-good'), { text: 'أعلى بنسبة 9.4% من سبتمبر', tone: 'bad' });
  assert.deepEqual(changePhrase({ amount: -200, pct: -20 }, 'سبتمبر', 'down-is-good'), { text: 'أدنى بنسبة 20% من سبتمبر', tone: 'good' });
  assert.deepEqual(changePhrase({ amount: -200, pct: -20 }, 'سبتمبر', 'up-is-good'), { text: 'أدنى بنسبة 20% من سبتمبر', tone: 'bad' });
  assert.deepEqual(changePhrase({ amount: 0, pct: null }, 'سبتمبر', 'up-is-good'), { text: 'مثل سبتمبر', tone: 'neutral' });
  assert.deepEqual(changePhrase({ amount: 300, pct: null }, 'سبتمبر', 'up-is-good'), { text: 'لا مقارنة: لا حركة في سبتمبر', tone: 'neutral' });
  assert.ok(!/[+−-]\d/.test(changePhrase({ amount: -5, pct: -5 }, 'سبتمبر', 'up-is-good').text));
  assert.equal(pctText(1234.56), '1,234.6%');
  assert.equal(monthName('سبتمبر 2026'), 'سبتمبر');
  assert.deepEqual(ratePhrase(-71.7, 'سبتمبر'), { text: 'أدنى بـ 71.7 نقطة من سبتمبر', tone: 'bad' });
  assert.deepEqual(ratePhrase(5, 'سبتمبر'), { text: 'أعلى بـ 5 نقاط من سبتمبر', tone: 'good' });
  assert.deepEqual(ratePhrase(1, 'سبتمبر'), { text: 'أعلى بنقطة واحدة من سبتمبر', tone: 'good' });
  assert.deepEqual(ratePhrase(0.01, 'سبتمبر'), { text: 'مثل سبتمبر', tone: 'neutral' });
  assert.equal(ratePhrase(null, 'سبتمبر'), null);
});

// ── fixtures ────────────────────────────────────────────────────────────────
const cat = (code, name, type) => ({ code, name_ar: name, type });
const RNT = cat('REV-RNT', 'إيجارات المحلات', 'REVENUE');
const PRK = cat('REV-PRK', 'مواقف السيارات', 'REVENUE');
const MNT = cat('EXP-MNT', 'صيانة', 'EXPENSE');
const ELC = cat('EXP-ELC', 'كهرباء', 'EXPENSE');
const SAL = cat('EXP-SAL', 'مرتبات', 'EXPENSE');
const DEP = cat('LIA-DEP', 'تأمينات مستأجرين', 'LIABILITY');
let n = 0;
const tx = (kind, amount, date, category, status = 'POSTED') => ({ id: `t${++n}`, kind, status, amount, tx_date: date, category });

const transactions = [
  tx('REVENUE', 3000, '2026-10-03', RNT),
  tx('REVENUE', '1500.000', '2026-10-10', RNT, 'RECONCILED'),
  tx('REVENUE', 500, '2026-10-12', PRK),
  tx('REVENUE', 800, '2026-10-05', DEP),
  tx('EXPENSE', 1200, '2026-10-07', MNT),
  tx('EXPENSE', 400, '2026-10-09', ELC),
  tx('EXPENSE', 150, '2026-10-15', null),
  tx('EXPENSE', 999, '2026-10-16', MNT, 'VOIDED'),
  tx('REVENUE', 700, '2026-10-17', RNT, 'DRAFT'),
  tx('EXPENSE', 300, '2026-10-11', DEP),
  tx('REVENUE', 4000, '2026-09-04', RNT),
  tx('EXPENSE', 1000, '2026-09-20', MNT),
  tx('EXPENSE', 600, '2026-09-25', SAL),
  tx('REVENUE', 9999, '2026-08-15', RNT), // two months back: in no figure
];

const rentRow = (id, status, amount, paid, extra = {}) => ({ id, name: `م${id}`, shop_number: id, current_month_amount: amount, current_month_paid: paid, current_month_status: status, ...extra });
const rent = [
  rentRow('r1', 'paid_full', '1000', '1000'),
  rentRow('r2', 'paid_partial', '2000', '500'),
  rentRow('r3', 'unpaid', '1500', '0'),
  rentRow('r4', 'exempt', '0', '0'),
  rentRow('r5', 'no_rent_set', null, '0'),
  rentRow('r6', 'unpaid', null, '0', { monthly_rent: '800' }),
];
const rentPrev = [rentRow('p1', 'paid_full', '1000', '1000'), rentRow('p2', 'paid_full', '2000', '2000')];

const aging = [
  { tenant_id: 'a1', tenant_name: 'أ', shop_number: '1', total_outstanding: 5000, bucket_current: 1000, bucket_30: 1500, bucket_60: 1000, bucket_90_plus: 1500 },
  { tenant_id: 'a2', tenant_name: 'ب', shop_number: '2', total_outstanding: '2500', bucket_current: '2500', bucket_30: 0, bucket_60: 0, bucket_90_plus: 0 },
  { tenant_id: 'a3', tenant_name: 'ج', shop_number: '3', total_outstanding: 0, bucket_current: 0, bucket_30: 0, bucket_60: 0, bucket_90_plus: 0 },
  { tenant_id: 'a4', tenant_name: 'د', shop_number: '4', total_outstanding: 800, bucket_current: 0, bucket_30: 0, bucket_60: 0, bucket_90_plus: 800 },
];

// newest first, as get_cashbox_ledger returns them
const row = (date, amount, balance, source = 'transaction') => ({ event_date: date, signed_amount: amount, balance_after: balance, source_type: source });
const cashboxes = [
  {
    id: 'b1', name_ar: 'الخزينة النقدية', kind: 'CASH', opening_balance: '1000',
    rows: [
      row('2026-10-12', 500, 4300),
      row('2026-10-09', -400, 3800),
      row('2026-10-05', -500, 4200, 'cash_transfer'),
      row('2026-10-03', 3000, 4700),
      row('2026-09-15', -300, 1700),
      row('2026-08-20', 1000, 2000),
    ],
  },
  { id: 'b2', name_ar: 'مصرف الواحة', kind: 'BANK', opening_balance: 500, rows: [] },
];

const base = { month: MONTH, today: TODAY, transactions, rent, rentPrev, aging, cashboxes, occupancy: null, expiry: null };
const report = buildMonthlyReport(base);

// ── cash ────────────────────────────────────────────────────────────────────
check('revenue and expense count posted and reconciled rows of the month only', () => {
  assert.equal(report.cash.revenue, 5000); // 3000 + 1500 reconciled + 500; not the draft, not August
  assert.equal(report.cash.expense, 1750); // 1200 + 400 + 150; not the voided one
  assert.equal(report.cash.net, 3250);
  assert.deepEqual(report.cash.prev, { revenue: 4000, expense: 1600, net: 2400 });
});
check('compared with the month before', () => {
  assert.deepEqual(report.cash.change.revenue, { amount: 1000, pct: 25 });
  assert.deepEqual(report.cash.change.expense, { amount: 150, pct: 9.4 });
  assert.deepEqual(report.cash.change.net, { amount: 850, pct: 35.4 });
});
check('a deposit is kept out of income and expense and shown on its own', () => {
  assert.equal(report.cash.depositsReceived, 800);
  assert.equal(report.cash.depositsPaid, 300);
  assert.ok(!report.revenueRows.some((r) => r.key === 'LIA-DEP'));
  assert.ok(!report.expenseRows.some((r) => r.key === 'LIA-DEP'));
});
check('drafts are counted, not added', () => {
  assert.equal(report.cash.draftCount, 1);
});
check('revenue by category, largest first, with share and change', () => {
  assert.deepEqual(report.revenueRows.map((r) => [r.key, r.amount, r.share, r.prev]), [['REV-RNT', 4500, 90, 4000], ['REV-PRK', 500, 10, 0]]);
  assert.deepEqual(report.revenueRows[0].change, { amount: 500, pct: 12.5 });
  assert.equal(report.revenueRows[1].change.pct, null);
});
check('expense by category; a row without a category is named, not dropped', () => {
  assert.deepEqual(report.expenseRows.map((r) => [r.name, r.amount]), [['صيانة', 1200], ['كهرباء', 400], ['بدون بند', 150]]);
  assert.deepEqual(report.expenseRows[0].change, { amount: 200, pct: 20 });
  assert.equal(report.expenseRows[0].share, 68.6);
});
check('beyond eight categories the rest fold into one row that still adds up', () => {
  const many = Array.from({ length: 11 }, (_, i) => tx('EXPENSE', 100 + i * 10, '2026-10-05', cat(`EXP-${i}`, `بند ${i}`, 'EXPENSE')));
  const r = buildMonthlyReport({ ...base, transactions: many });
  assert.equal(r.expenseRows.length, 9);
  const other = r.expenseRows.at(-1);
  assert.equal(other.key, OTHER_KEY);
  assert.equal(other.name, 'أخرى');
  assert.equal(other.amount, 100 + 110 + 120); // the three smallest
  assert.equal(r.expenseRows.reduce((s, x) => s + x.amount, 0), r.cash.expense);
});

// ── rent ────────────────────────────────────────────────────────────────────
check('rent due, collected and the tenants by state (exempt and unpriced are not due)', () => {
  assert.deepEqual(report.rent.tenants, { paidFull: 1, partial: 1, unpaid: 2, exempt: 1, noRent: 1 });
  assert.equal(report.rent.due, 5300); // 1000 + 2000 + 1500 + 800 (monthly rent when the month has no amount)
  assert.equal(report.rent.collected, 1500);
  assert.equal(report.rent.remaining, 3800);
  assert.equal(report.rent.rate, 28.3);
});
check('collection rate against the month before', () => {
  assert.equal(report.rent.prev.rate, 100);
  assert.equal(report.rent.rateChange, -71.7);
  const noPrev = buildMonthlyReport({ ...base, rentPrev: [] });
  assert.equal(noPrev.rent.rateChange, null);
});

// ── arrears ─────────────────────────────────────────────────────────────────
check('arrears: total, ageing buckets, and the largest debtors first without the settled', () => {
  assert.equal(report.arrears.total, 8300);
  assert.equal(report.arrears.tenants, 3);
  assert.deepEqual(report.arrears.buckets, { current: 3500, d30: 1500, d60: 1000, d90: 2300 });
  assert.deepEqual(report.arrears.top.map((d) => [d.name, d.amount]), [['أ', 5000], ['ب', 2500], ['د', 800]]);
});
check('only the ten largest debtors are listed, but the total covers everyone', () => {
  const crowd = Array.from({ length: 14 }, (_, i) => ({ tenant_id: `x${i}`, tenant_name: `م${i}`, shop_number: String(i), total_outstanding: 100 + i }));
  const r = buildMonthlyReport({ ...base, aging: crowd });
  assert.equal(r.arrears.top.length, 10);
  assert.equal(r.arrears.top[0].amount, 113);
  assert.equal(r.arrears.tenants, 14);
  assert.equal(r.arrears.total, crowd.reduce((s, d) => s + d.total_outstanding, 0));
});

// ── cashboxes ───────────────────────────────────────────────────────────────
check('a cashbox month: opening, in, out, transfers apart, closing — and they reconcile', () => {
  const [cash, bank] = report.cashboxes.rows;
  assert.deepEqual(
    { opening: cash.opening, inflow: cash.inflow, outflow: cash.outflow, transfersNet: cash.transfersNet, closing: cash.closing, ok: cash.reconciles },
    { opening: 1700, inflow: 3500, outflow: 400, transfersNet: -500, closing: 4300, ok: true },
  );
  assert.deepEqual({ opening: bank.opening, closing: bank.closing, inflow: bank.inflow, ok: bank.reconciles }, { opening: 500, closing: 500, inflow: 0, ok: true });
  assert.deepEqual(report.cashboxes.totals, { opening: 2200, inflow: 3500, outflow: 400, transfersNet: -500, closing: 4800 });
});
check('the same ledger gives an earlier month its own opening and closing', () => {
  const sept = buildMonthlyReport({ ...base, month: '2026-09' });
  const cash = sept.cashboxes.rows[0];
  assert.deepEqual({ opening: cash.opening, outflow: cash.outflow, closing: cash.closing, ok: cash.reconciles }, { opening: 2000, outflow: 300, closing: 1700, ok: true });
});

// ── the month's frame ───────────────────────────────────────────────────────
check('labels, bounds, and how far the month has run', () => {
  assert.equal(report.monthLabel, 'أكتوبر 2026');
  assert.equal(report.prevMonthLabel, 'سبتمبر 2026');
  assert.deepEqual([report.start, report.end, report.asOf, report.isCurrentMonth], ['2026-10-01', '2026-10-31', TODAY, true]);
  const sept = buildMonthlyReport({ ...base, month: '2026-09' });
  assert.deepEqual([sept.asOf, sept.isCurrentMonth], ['2026-09-30', false]);
});
check('a section that could not be read is absent, not zero', () => {
  const r = buildMonthlyReport({ ...base, rent: null, aging: null, cashboxes: null });
  assert.equal(r.rent, null);
  assert.equal(r.arrears, null);
  assert.equal(r.cashboxes, null);
  assert.equal(r.cash.revenue, 5000);
});

// ── today's mall: the current month only ────────────────────────────────────
const day = (o) => addDaysISO(TODAY, o);
const units = [
  { id: 'u1', unit_number: '101', floor: 'الأرضي', area_sqm: '40', status: 'OCCUPIED', created_at: '2025-01-01T00:00:00Z' },
  { id: 'u2', unit_number: '102', floor: 'الأرضي', area_sqm: '30', status: 'AVAILABLE', created_at: '2025-01-01T00:00:00Z' },
];
const contracts = [
  { id: 'k1', unit_id: 'u1', tenant_id: 't1', status: 'ACTIVE', start_date: day(-300), end_date: day(20), monthly_rent: '1000', tenant: { id: 't1', name: 'أحمد', phone: null }, unit: { id: 'u1', unit_number: '101', floor: 'الأرضي' } },
];
const occupancy = buildMallOccupancy({ units, contracts, today: TODAY });
const expiry = buildContractExpiry({ contracts, today: TODAY });
check('the mall picture is in the current month report only', () => {
  const now = buildMonthlyReport({ ...base, occupancy, expiry });
  assert.equal(now.mall.rate, 50);
  assert.equal(now.mall.rented, 1);
  assert.equal(now.mall.vacant, 1);
  assert.equal(now.mall.rentRoll, 1000);
  assert.equal(now.mall.expiry.within30, 1);
  assert.equal(now.mall.expiry.total, 1);
  assert.equal(now.mall.expiry.rentAtRisk, 1000);
  assert.deepEqual(now.mall.expiry.next[0], { tenantName: 'أحمد', unitNumber: '101', endDate: day(20), daysLeft: 20 });
  const past = buildMonthlyReport({ ...base, month: '2026-09', occupancy, expiry });
  assert.equal(past.mall, null);
});

console.log(`\n${passed} checks passed`);
