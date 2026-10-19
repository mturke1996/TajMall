/**
 * The money and date primitives every screen leans on: how an amount is read from a field and drawn, which
 * day "today" is in Libya (UTC+2) whatever the clock of the machine says, and the rent figures that must
 * agree across the profile, the statement, the monthly report and the dashboard.
 *   npx tsx scripts/verify-money-core.mjs
 *
 * Each check is a scenario an accountant meets: a number that failed to load, an amount pasted from the
 * screen, midnight at the turn of a year, a payment the bank has reconciled, a lease that has ended.
 */
import assert from 'node:assert/strict';

const utils = await import('../src/lib/utils.ts');
const rentMonths = await import('../src/lib/rent-months.ts');
const series = await import('../src/lib/mall-rent-collection-series.ts');
const kpis = await import('../src/lib/mall-rent-kpis.ts');
const account = await import('../src/lib/tenant-rent-account.ts');
const statement = await import('../src/lib/tenant-statement.ts');
const report = await import('../src/lib/monthly-report.ts');
const fromData = await import('../src/lib/tenant-rent-account-from-data.ts');

const { formatMoney, formatNumber, formatPercent, parseAmountInput, todayISODate } = utils;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    const got = e && 'actual' in e && e.generatedMessage !== undefined ? ` (got ${JSON.stringify(e.actual)}, expected ${JSON.stringify(e.expected)})` : '';
    const why = `${String(e.message).split('\n')[0]}${got}`;
    failures.push(`${name}: ${why}`);
    console.log(`FAIL  ${name}\n      ${why}`);
  }
};

/** Runs `fn` with the clock fixed at `iso` and the machine in `tz`, then puts both back. */
function atClock(iso, tz, fn) {
  const RealDate = Date;
  const previousTz = process.env.TZ;
  const fixed = new RealDate(iso).getTime();
  process.env.TZ = tz;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() {
      return fixed;
    }
  };
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
}

/** the figure as it reads: direction marks removed, the no-break space between number and currency made plain */
const strip = (s) => s.replace(/[\u200e\u200f\u2066-\u2069]/g, '').replace(/\u00a0/g, ' ');

// ── a value that failed to load is not zero ─────────────────────────────────
check('money: a missing or unreadable amount is drawn as a dash, never as 0', () => {
  for (const bad of [undefined, null, '', '   ', 'abc', NaN, Infinity, -Infinity, '١٢٣']) {
    const text = strip(formatMoney(bad));
    assert.ok(text.includes('—'), `formatMoney(${String(bad)}) = "${text}"`);
    assert.ok(!/\d/.test(text), `formatMoney(${String(bad)}) = "${text}" shows a digit`);
  }
});

check('money: a real zero is still 0, and ordinary figures are untouched', () => {
  assert.equal(strip(formatMoney(0)), '0 د.ل');
  assert.equal(strip(formatMoney('0.000')), '0 د.ل');
  assert.equal(strip(formatMoney(-0.0004)), '0 د.ل');
  assert.equal(strip(formatMoney(1234.5)), '1,234.5 د.ل');
  assert.equal(strip(formatMoney('749.500')), '749.5 د.ل');
  assert.equal(strip(formatMoney(-1250)), '−1,250 د.ل');
  assert.equal(strip(formatMoney(0.001)), '0.001 د.ل');
});

check('money: a negative amount keeps its magnitude whichever way the half rounds', () => {
  // +1.0005 and −1.0005 are the same size; the sign must not change how many thousandths are shown
  assert.equal(strip(formatMoney(1.0005)).replace('−', ''), strip(formatMoney(-1.0005)).replace('−', ''));
});

check('numbers: an unreadable count or percentage is a dash, not 0', () => {
  assert.equal(formatNumber(NaN), '—');
  assert.equal(formatNumber('abc'), '—');
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatPercent(NaN), '—');
  assert.equal(formatPercent(12.34), '12.3%');
  assert.equal(formatPercent(0), '0.0%');
});

// ── an amount typed or pasted into a field ──────────────────────────────────
check('amount field: what the screen shows can be pasted back (direction marks are not digits)', () => {
  assert.equal(parseAmountInput('\u20661,250.5\u2069'), 1250.5);
  assert.equal(parseAmountInput('\u202b١٢٠٠\u202c'), 1200);
  assert.equal(parseAmountInput('\u200f750\u200e'), 750);
});

check('amount field: the Arabic comma is a thousands separator like the Latin one', () => {
  assert.equal(parseAmountInput('1،250'), 1250);
  assert.equal(parseAmountInput('12،345،678'), 12345678);
  assert.equal(parseAmountInput('1،5'), 1.5);
});

check('amount field: Arabic digits, decimal mark and plain forms still read as before', () => {
  assert.equal(parseAmountInput('١٢٣٫٥'), 123.5);
  assert.equal(parseAmountInput('1,250'), 1250);
  assert.equal(parseAmountInput('1,25'), 1.25);
  assert.equal(parseAmountInput('0.001'), 0.001);
  assert.equal(parseAmountInput('.5'), 0.5);
  assert.equal(parseAmountInput(''), 0);
  assert.equal(parseAmountInput('  '), 0);
});

check('amount field: anything that is not a plain amount is refused, not guessed', () => {
  for (const bad of ['-5', '1e3', '5.', '1.2345', '1.250,5', 'abc', '1,2,3', '٠٫٠٠٠١', '12 د.ل', '--1', '+5']) {
    assert.ok(Number.isNaN(parseAmountInput(bad)), `"${bad}" read as ${parseAmountInput(bad)}`);
  }
});

check('amount field: a fat-fingered figure past what the books can hold is refused, not posted', () => {
  assert.ok(Number.isNaN(parseAmountInput('99999999999999999999')));
  assert.ok(Number.isNaN(parseAmountInput('1000000000001')));
  assert.equal(parseAmountInput('999999999999.999'), 999999999999.999);
});

// ── which day it is in Libya ────────────────────────────────────────────────
check('today: 00:30 on 1 January in Tripoli is 1 January even on a machine set to New York', () => {
  atClock('2026-12-31T22:30:00Z', 'America/New_York', () => {
    assert.equal(todayISODate(), '2027-01-01');
  });
});

check('today: 23:30 on 31 December in Tripoli is still 31 December on a machine set to Tokyo', () => {
  atClock('2026-12-31T21:30:00Z', 'Asia/Tokyo', () => {
    assert.equal(todayISODate(), '2026-12-31');
  });
});

check('today: a date the caller built is formatted as the caller meant it, in any time zone', () => {
  atClock('2026-06-15T10:00:00Z', 'Asia/Tokyo', () => {
    assert.equal(todayISODate(new Date(2026, 9, 1)), '2026-10-01');
    assert.equal(todayISODate(new Date(2026, 8, 30)), '2026-09-30');
  });
});

check('month and year: the rent screens turn over with Libya, not with the machine', () => {
  atClock('2026-12-31T22:30:00Z', 'America/New_York', () => {
    assert.equal(rentMonths.currentYear(), 2027);
    assert.equal(rentMonths.currentMonthKey(), '2027-01');
    assert.equal(rentMonths.currentCalendarMonthIndex(), 1);
    assert.deepEqual(rentMonths.yearMonthsThroughCurrent(2027), ['2027-01']);
    assert.equal(series.getMallRentDashboardYear(), 2027);
    assert.deepEqual(series.ytdMonthKeysInYear(2027), ['2027-01']);
  });
  atClock('2026-12-31T21:30:00Z', 'Asia/Tokyo', () => {
    assert.equal(rentMonths.currentMonthKey(), '2026-12');
    assert.equal(rentMonths.yearMonthsThroughCurrent(2026).length, 12);
  });
});

check('month and year: an explicit reference date is still honoured', () => {
  assert.deepEqual(series.ytdMonthKeysInYear(2026, new Date(2026, 2, 10)), ['2026-01', '2026-02', '2026-03']);
  assert.equal(series.getMallRentDashboardYear(new Date(2025, 5, 1)), 2025);
});

// ── a figure with three decimals reads the same everywhere ──────────────────
check('rent month progress: grouped and decimal marks match the rest of the app (1,234.5, not 1.234,5)', () => {
  const text = rentMonths.formatRentMonthPartialProgress(1234.5, 2000);
  assert.equal(strip(text), '1,234.5 / 2,000 د.ل');
  assert.equal(rentMonths.formatRentMonthPartialProgress(0.5, 1000.125), '0.5 / 1,000.125 د.ل');
  assert.equal(rentMonths.formatRentMonthPartialProgress(10, 0), '');
});

// ── rent figures that must agree ────────────────────────────────────────────
const rentMonth = (month, status, amount, paid, charge = true) => ({
  month,
  status,
  amount,
  paid,
  charge_id: charge ? `c-${month}` : null,
  description: null,
});
const emptyYear = (year) =>
  Array.from({ length: 12 }, (_, i) => rentMonth(`${year}-${String(i + 1).padStart(2, '0')}`, 'no_charge', 1000, 0, false));
const calendar = (year, patch) => ({
  year,
  tenant_id: 't1',
  monthly_rent: 1000,
  contract_id: 'L1',
  months: emptyYear(year).map((m) => patch[m.month] ?? m),
});
const pricing = { bands: [], leaseRent: null, contactRent: 1000 };

check('lease ended: months after its end are not owed, but a charge already raised still is', () => {
  const cal = calendar(2026, {
    '2026-01': rentMonth('2026-01', 'paid', 1000, 1000),
    '2026-02': rentMonth('2026-02', 'paid', 1000, 1000),
    '2026-03': rentMonth('2026-03', 'unpaid', 1000, 0),
  });
  const base = { calendars: [cal], pricing, claimStart: '2026-01-01', now: '2026-10' };
  const open = account.buildTenantRentAccount(base);
  assert.equal(open.owedNow, 8000, 'without an end, April to October count');
  const ended = account.buildTenantRentAccount({ ...base, claimEnd: '2026-03-31' });
  assert.equal(ended.owedNow, 1000, 'only the unpaid March charge remains');
  assert.deepEqual(ended.owingMonths, ['2026-03']);
  assert.deepEqual(ended.unchargedMonths, []);
  const april = ended.years[0].months.find((m) => m.month === '2026-04');
  assert.equal(april.kind, 'exempt');
  assert.equal(april.exemptReason, 'after_end');
  assert.equal(account.buildTenantRentAccount({ ...base, claimEnd: '2026-03' }).owedNow, 1000, 'a month key works too');
});

check('lease ended: a payment recorded after the end keeps its month visible', () => {
  const cal = calendar(2026, {
    '2026-01': rentMonth('2026-01', 'paid', 1000, 1000),
    '2026-05': rentMonth('2026-05', 'paid', 1000, 1000),
  });
  const ended = account.buildTenantRentAccount({ calendars: [cal], pricing, claimStart: '2026-01-01', now: '2026-10', claimEnd: '2026-03-31' });
  const may = ended.years[0].months.find((m) => m.month === '2026-05');
  assert.equal(may.kind, 'paid');
  assert.equal(ended.collected ?? ended.years[0].collected, 2000);
});

check('lease ended: the end of the claim comes from the tenant\'s leases', () => {
  const fn = account.tenantClaimEnd;
  assert.equal(typeof fn, 'function');
  const active = { status: 'ACTIVE', start_date: '2026-01-01', end_date: '2026-12-31' };
  const done = { status: 'TERMINATED', start_date: '2025-01-01', end_date: '2025-12-31' };
  const done2 = { status: 'EXPIRED', start_date: '2024-01-01', end_date: '2024-12-31' };
  assert.equal(fn([active, done]), null, 'a running lease keeps the claim open');
  assert.equal(fn([done, done2]), '2025-12-31', 'the latest end wins');
  assert.equal(fn([]), null, 'a tenant with no lease at all is billed from his card, as before');
  assert.equal(fn([{ status: 'TERMINATED', start_date: '2025-01-01', end_date: null }]), null, 'no end date: nothing to cut at');
  assert.equal(fn(null), null);
});

check('lease ended: the profile builder passes the end through, so the account stops claiming after it', () => {
  const charge = (month) => ({
    id: `c-${month}`,
    contract_id: 'L1',
    type: 'RENT',
    due_date: `${month}-01`,
    amount: 1000,
    total_paid: 1000,
    status: 'PAID',
    contract: { tenant: { id: 't1' }, tenant_id: 't1' },
    rent_journal_links: [],
    journal: null,
    description: '',
    journal_entry_id: null,
  });
  const charges = ['2026-01', '2026-02', '2026-03'].map(charge);
  const leases = [{ status: 'TERMINATED', start_date: '2026-01-01', end_date: '2026-03-19', monthly_rent: 1000 }];
  atClock('2026-10-19T10:00:00Z', 'UTC', () => {
    const years = fromData.tenantRentYears(charges, 2026, '2026-01-01');
    const input = { tenantId: 't1', contactRent: 1000, claimStart: '2026-01-01', years, charges, manualExemptMonths: [], pricing: { bands: [], leaseRent: fromData.activeLeaseRent(leases), contactRent: 1000 } };
    assert.equal(fromData.buildTenantRentAccountFromData(input).owedNow, 7000, 'as before: April to October');
    const built = fromData.buildTenantRentAccountFromData({ ...input, claimEnd: fromData.tenantClaimEnd(leases) });
    assert.equal(built.owedNow, 0);
    assert.equal(built.claimTo, '2026-03');
  });
});

const receipt = (id, amount, status) => ({ id, number: 1, tx_date: '2026-10-05', amount, status, kind: 'REVENUE', category: { code: 'REV-RNT' } });

check('statement: a rent receipt the bank has reconciled counts like a posted one', () => {
  assert.equal(statement.isStatementReceipt(receipt('r', 1000, 'POSTED')), true);
  assert.equal(statement.isStatementReceipt(receipt('r', 1000, 'RECONCILED')), true);
  assert.equal(statement.isStatementReceipt(receipt('r', 1000, 'DRAFT')), false);
  assert.equal(statement.isStatementReceipt(receipt('r', 1000, 'VOIDED')), false);
});

check('unlinked rent: a reconciled receipt with no month is found like a posted one', () => {
  const run = (status) =>
    account.unlinkedRentReceipts({
      receipts: [receipt('r1', 800, status)],
      journalEntries: [{ id: 'j1', status: 'POSTED', source_type: 'TRANSACTION', source_id: 'r1' }],
      charges: [],
    });
  assert.deepEqual(run('POSTED'), { total: 800, count: 1 });
  assert.deepEqual(run('RECONCILED'), { total: 800, count: 1 });
  assert.deepEqual(run('VOIDED'), { total: 0, count: 0 });
});

// ── the monthly report ──────────────────────────────────────────────────────
const reportInput = (extra) => ({
  month: '2026-09',
  today: '2026-10-19',
  transactions: [],
  rent: [],
  rentPrev: null,
  aging: null,
  cashboxes: null,
  occupancy: null,
  expiry: null,
  ...extra,
});
const rentRow = (id, status, amount, paid) => ({
  id,
  name: id,
  shop_number: null,
  monthly_rent: amount,
  current_month_amount: amount,
  current_month_paid: paid,
  current_month_status: status,
});

check('monthly report: a month the database calls fully paid has nothing remaining', () => {
  const r = report.buildMonthlyReport(
    reportInput({ rent: [rentRow('a', 'paid_full', 1000, 1000), rentRow('b', 'paid_full', 1000, 800), rentRow('c', 'unpaid', 500, 0)] }),
  );
  assert.equal(r.rent.tenants.paidFull, 2);
  assert.equal(r.rent.remaining, 500, 'only the unpaid tenant owes');
  assert.equal(r.rent.due, 2500);
  assert.equal(r.rent.collected, 2000, 'a month marked paid in full counts as collected in full');
  assert.equal(r.rent.rate, 80);
});

check('monthly report: a partly paid month still owes the rest', () => {
  const r = report.buildMonthlyReport(reportInput({ rent: [rentRow('a', 'paid_partial', 1000, 400), rentRow('b', 'exempt', 0, 0)] }));
  assert.equal(r.rent.remaining, 600);
  assert.equal(r.rent.collected, 400);
  assert.equal(r.rent.tenants.exempt, 1);
});

// ── the dashboard series and the lifetime figures ───────────────────────────
const charge = (id, contract, month, amount, paid, status, tenant) => ({
  id,
  contract_id: contract,
  tenant_id: tenant,
  amount,
  total_paid: paid,
  due_date: `${month}-01`,
  status,
});

check('dashboard: one rent charge per tenant and month, even when it sits on two of his leases', () => {
  const charges = [
    charge('a', 'L1', '2026-02', 1000, 0, 'UNPAID', 't1'),
    charge('b', 'L2', '2026-02', 1000, 1000, 'PAID', 't1'),
    charge('c', 'L2', '2026-03', 1000, 0, 'UNPAID', 't1'),
    charge('d', 'L9', '2026-02', 700, 0, 'UNPAID', 't2'),
  ];
  const kept = series.dedupeRentChargesByContractMonth(charges);
  assert.equal(kept.length, 3);
  assert.ok(kept.find((c) => c.id === 'b'), 'the paid copy wins');
  assert.ok(!kept.find((c) => c.id === 'a'));
  const model = series.buildMallRentDashboardModel(charges, 2026, new Date(2026, 5, 1));
  assert.equal(model.yearKpis.billed, 2700);
  assert.equal(model.yearKpis.collected, 1000);
  assert.equal(model.duplicateCount, 1);
});

check('dashboard: charges that do not say whose they are are still deduplicated per lease', () => {
  const charges = [
    { id: 'a', contract_id: 'L1', amount: 1000, total_paid: 0, due_date: '2026-02-01', status: 'UNPAID' },
    { id: 'b', contract_id: 'L1', amount: 1000, total_paid: 400, due_date: '2026-02-01', status: 'PARTIAL' },
    { id: 'c', contract_id: 'L2', amount: 500, total_paid: 0, due_date: '2026-02-01', status: 'UNPAID' },
  ];
  const kept = series.dedupeRentChargesByContractMonth(charges);
  assert.equal(kept.length, 2);
  assert.ok(kept.find((c) => c.id === 'b'));
});

const summaryRow = (status, monthly, paid, extra = {}) => ({
  id: String(Math.random()),
  name: 'x',
  monthly_rent: String(monthly),
  current_month_amount: String(monthly),
  current_month_paid: String(paid),
  current_month_status: status,
  total_rent_paid: '0',
  open_charges_total: '0',
  open_charges_count: 0,
  ...extra,
});

check('lifetime rent figures with no charges yet: a tenant excluded from the claim is not "expected"', () => {
  const k = kpis.aggregateMallRentKpis([
    summaryRow('paid_full', 1000, 1000),
    summaryRow('unpaid', 500, 0),
    summaryRow('exempt', 800, 0),
    summaryRow('no_rent_set', 0, 0),
  ]);
  assert.equal(k.basis, 'monthly');
  assert.equal(k.expectedRent, 1500);
  assert.equal(k.collectedRent, 1000);
  assert.equal(k.outstandingRent, 500);
  assert.ok(Math.abs(k.collectionRate - (1000 / 1500) * 100) < 1e-9);
  assert.equal(k.currentMonthDueCount, 2);
  assert.equal(k.currentMonthPaidCount, 1);
});

check('lifetime rent figures from charges are unchanged', () => {
  const k = kpis.aggregateMallRentKpis([
    summaryRow('paid_full', 1000, 1000, { total_rent_paid: '3000', open_charges_total: '1000', open_charges_count: 1 }),
    summaryRow('unpaid', 500, 0, { total_rent_paid: '0', open_charges_total: '500.5', open_charges_count: 1 }),
  ]);
  assert.equal(k.basis, 'charges');
  assert.equal(k.collectedRent, 3000);
  assert.equal(k.outstandingRent, 1500.5);
  assert.equal(k.expectedRent, 4500.5);
  assert.equal(k.openChargesCount, 2);
});

console.log(`\n${passed} checks passed${failures.length ? `, ${failures.length} FAILED` : ''}`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
