/**
 * Monthly billing preview: which active leases still lack the month's rent and service charge, per-month
 * completeness for the current month and the two before it, what the server will and will not do (exempt
 * months, ended-but-active leases, closed periods), and the wording of the counts and of the run's result.
 *   npx tsx scripts/verify-billing-preview.mjs
 */
import assert from 'node:assert/strict';

const lib = await import('../src/lib/billing-preview.ts');
const { formatMoney } = await import('../src/lib/utils.ts');
const {
  buildBillingPreview,
  billingPostingRule,
  billingMonthOptions,
  billingExemptWindow,
  billingCountLine,
  billingFollowUpDetail,
  billingFollowUpTitle,
  billingRunHeadline,
  billingRunBreakdown,
  billingLeftLine,
  billingEndedActiveNote,
  billingIsLate,
  latestIncompleteMonth,
  parseBillingRunResult,
  recentBillingMonths,
  shiftMonth,
  isMonthKey,
} = lib;

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-18';
const lease = (n, o = {}) => ({
  id: `c${n}`,
  tenant_id: `t${n}`,
  status: 'ACTIVE',
  start_date: '2025-01-01',
  end_date: '2027-12-31',
  monthly_rent: '1000',
  services_amount: '0',
  tenant: { name: `مستأجر ${n}` },
  unit: { unit_number: String(n) },
  ...o,
});
const charge = (contractId, type, month, extra = {}) => ({ contract_id: contractId, type, due_date: `${month}-01`, ...extra });
const run = (contracts, charges, o = {}) => buildBillingPreview({ contracts, charges, month: '2026-10', today: TODAY, ...o });
const ids = (p) => p.missingLines.map((l) => l.contractId);

check('counts: a lease is generated only when every charge it should have exists', () => {
  const contracts = [
    lease(1, { monthly_rent: '1000', services_amount: '100' }),
    lease(2, { monthly_rent: '2000' }),
    lease(3, { monthly_rent: '1500', services_amount: '200' }),
    lease(4, { monthly_rent: '800' }),
  ];
  const charges = [
    charge('c1', 'RENT', '2026-10'),
    charge('c1', 'SERVICE', '2026-10'),
    charge('c2', 'RENT', '2026-10'),
    charge('c3', 'RENT', '2026-10'),
  ];
  const p = run(contracts, charges);
  assert.equal(p.total, 4);
  assert.equal(p.generated, 2);
  assert.equal(p.missing, 2);
  assert.equal(p.complete, false);
  assert.equal(p.missingAmount, 1000);
  assert.deepEqual(ids(p), ['c3', 'c4']);
  // c3 has its rent and lacks the service; c4 lacks the rent and has no service to bill
  assert.deepEqual([p.missingLines[0].missingRent, p.missingLines[0].missingService], [null, 200]);
  assert.deepEqual([p.missingLines[1].missingRent, p.missingLines[1].missingService], [800, null]);
  assert.equal(p.missingLines[0].tenantName, 'مستأجر 3');
  assert.equal(p.missingLines[0].unitNumber, '3');
});

check('a service charge is expected only when the lease has a service amount', () => {
  const noService = run([lease(1, { services_amount: '0' }), lease(2, { services_amount: null }), lease(3, { services_amount: 'x' })], [charge('c1', 'RENT', '2026-10'), charge('c2', 'RENT', '2026-10'), charge('c3', 'RENT', '2026-10')]);
  assert.equal(noService.missing, 0);
  const withService = run([lease(1, { services_amount: '50.5' })], [charge('c1', 'RENT', '2026-10')]);
  assert.equal(withService.missing, 1);
  assert.equal(withService.missingAmount, 50.5);
});

check('a month with every charge in place is complete', () => {
  const p = run([lease(1), lease(2)], [charge('c1', 'RENT', '2026-10'), charge('c2', 'RENT', '2026-10')]);
  assert.equal(p.complete, true);
  assert.equal(p.generated, 2);
  assert.deepEqual(p.missingLines, []);
  assert.equal(p.missingAmount, 0);
});

check('with no leases there is nothing to bill and nothing missing', () => {
  const p = run([], []);
  assert.equal(p.total, 0);
  assert.equal(p.missing, 0);
  assert.equal(p.complete, true);
});

check('only ACTIVE leases are billed', () => {
  const p = run([lease(1), lease(2, { status: 'EXPIRED' }), lease(3, { status: 'TERMINATED' })], []);
  assert.equal(p.total, 1);
  assert.deepEqual(ids(p), ['c1']);
  assert.equal(p.endedActive, 0);
});

check('start and end dates: a lease must overlap the month', () => {
  const p = run(
    [
      lease(1, { start_date: '2026-11-01' }), // starts after the month
      lease(2, { start_date: '2026-10-31' }), // starts on its last day
      lease(3, { end_date: '2026-10-01' }), // ends on its first day
      lease(4, { end_date: '2026-09-30' }), // ended before it
      lease(5, { end_date: null }), // open-ended
      lease(6, { start_date: null, end_date: '' }),
    ],
    [],
  );
  assert.deepEqual(ids(p), ['c2', 'c3', 'c5', 'c6']);
  assert.equal(p.total, 4);
});

check('an active lease that ended before the month is reported apart, not counted', () => {
  const p = run([lease(1), lease(2, { end_date: '2026-06-30' }), lease(3, { end_date: '2025-12-31' })], []);
  assert.equal(p.total, 1);
  assert.equal(p.endedActive, 2);
  assert.deepEqual(ids(p), ['c1']);
});

check('charges of another month, another type or another day of the month do not count', () => {
  const p = run(
    [lease(1), lease(2), lease(3), lease(4)],
    [
      charge('c1', 'RENT', '2026-09'),
      charge('c2', 'FINE', '2026-10'),
      { contract_id: 'c3', type: 'RENT', due_date: '2026-10-15' },
      charge('c4', 'SERVICE', '2026-10'), // a service charge is not the rent
    ],
  );
  assert.equal(p.missing, 4);
});

check('rent is matched by tenant: a charge on another lease of the same tenant counts', () => {
  const contracts = [
    lease(1, { id: 'old', tenant_id: 'T', status: 'EXPIRED', start_date: '2024-01-01', end_date: '2025-12-31' }),
    lease(2, { id: 'new', tenant_id: 'T', start_date: '2026-01-01' }),
  ];
  assert.equal(run(contracts, [charge('old', 'RENT', '2026-10')]).missing, 0);
  assert.equal(run(contracts, []).missing, 1);
});

check('a charge whose lease is unknown falls back to the tenant it carries', () => {
  const contracts = [lease(1)];
  assert.equal(run(contracts, [{ contract_id: 'gone', type: 'RENT', due_date: '2026-10-01', contract: { tenant_id: 't1' } }]).missing, 0);
  assert.equal(run(contracts, [{ contract_id: 'gone', type: 'RENT', due_date: '2026-10-01' }]).missing, 1);
});

check('a service charge belongs to its own lease, not to the tenant', () => {
  const contracts = [lease(1, { id: 'a', tenant_id: 'T', services_amount: '100' }), lease(2, { id: 'b', tenant_id: 'T', start_date: '2026-03-01', services_amount: '100' })];
  const p = run(contracts, [charge('b', 'RENT', '2026-10'), charge('b', 'SERVICE', '2026-10')]);
  assert.deepEqual(ids(p), ['a']);
  assert.deepEqual([p.missingLines[0].missingRent, p.missingLines[0].missingService], [null, 100]);
});

check('two running leases of one tenant bill the rent once, on the latest lease', () => {
  const contracts = [lease(1, { id: 'a', tenant_id: 'T', start_date: '2025-01-01', monthly_rent: '1000' }), lease(2, { id: 'b', tenant_id: 'T', start_date: '2026-06-01', monthly_rent: '1200' })];
  const p = run(contracts, []);
  assert.equal(p.total, 1);
  assert.deepEqual(ids(p), ['b']);
  assert.equal(p.missingAmount, 1200);
  // with a service on the older lease it is its own line
  const withService = run([{ ...contracts[0], services_amount: '100' }, contracts[1]], []);
  assert.equal(withService.total, 2);
  assert.equal(withService.missingAmount, 1300);
  assert.deepEqual([...ids(withService)].sort(), ['a', 'b']);
});

check('exempt month: the rent is not required but a service charge still is', () => {
  const exemptMonths = [{ tenant_id: 't1', month_key: '2026-10' }, { tenant_id: 't2', month_key: '2026-10' }, { tenant_id: 't3', month_key: '2026-09' }];
  const contracts = [lease(1), lease(2, { services_amount: '75' }), lease(3)];
  const p = run(contracts, [], { exemptMonths });
  // t1 has nothing left to bill, t2 still owes the service, t3 is exempt for another month only
  assert.deepEqual(ids(p), ['c2', 'c3']);
  assert.equal(p.total, 2);
  assert.equal(p.exemptTenants, 2);
  assert.deepEqual([p.missingLines[0].missingRent, p.missingLines[0].missingService], [null, 75]);
  assert.equal(p.missingLines[1].missingRent, 1000);
  // no exempt list: the same tenants are simply missing
  assert.equal(run(contracts, []).missing, 3);
});

check('a lease with no rent figure and no service has nothing to bill and is reported', () => {
  const p = run([lease(1, { monthly_rent: '0' }), lease(2, { monthly_rent: null }), lease(3, { monthly_rent: 'abc' }), lease(4)], []);
  assert.equal(p.total, 1);
  assert.equal(p.unpriced, 3);
  assert.deepEqual(ids(p), ['c4']);
  const serviceOnly = run([lease(1, { monthly_rent: '0', services_amount: '60' })], []);
  assert.equal(serviceOnly.total, 1);
  assert.equal(serviceOnly.unpriced, 0);
  assert.deepEqual([serviceOnly.missingLines[0].missingRent, serviceOnly.missingLines[0].missingService], [null, 60]);
});

check('a lease that only repeats its tenant rent is not "unpriced"', () => {
  const contracts = [lease(1, { id: 'a', tenant_id: 'T', start_date: '2025-01-01' }), lease(2, { id: 'b', tenant_id: 'T', start_date: '2026-06-01', monthly_rent: '0' })];
  const p = run(contracts, []);
  assert.equal(p.unpriced, 0);
  assert.equal(p.total, 1);
});

check('recent months: the current one and the two before, oldest first, each counted on its own', () => {
  const contracts = [lease(1), lease(2), lease(3)];
  const charges = [
    charge('c1', 'RENT', '2026-08'),
    charge('c2', 'RENT', '2026-08'),
    charge('c3', 'RENT', '2026-08'),
    charge('c1', 'RENT', '2026-09'),
    charge('c2', 'RENT', '2026-09'),
    charge('c1', 'RENT', '2026-10'),
  ];
  const p = run(contracts, charges);
  assert.deepEqual(p.recent.map((m) => m.month), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(p.recent.map((m) => m.missing), [0, 1, 2]);
  assert.deepEqual(p.recent.map((m) => m.complete), [true, false, false]);
  assert.deepEqual(p.recent.map((m) => m.missingAmount), [0, 1000, 2000]);
  // the same three whichever month is being previewed
  const older = run(contracts, charges, { month: '2026-08' });
  assert.deepEqual(older.recent, p.recent);
  assert.equal(older.missing, 0);
});

check('recent months cross a year boundary', () => {
  assert.deepEqual(recentBillingMonths('2026-01-15'), ['2025-11', '2025-12', '2026-01']);
  assert.deepEqual(recentBillingMonths('2026-02-01'), ['2025-12', '2026-01', '2026-02']);
  assert.deepEqual(recentBillingMonths('nope'), []);
});

check('a month after today is flagged future and is simply all missing', () => {
  const p = run([lease(1), lease(2)], [], { month: '2026-11' });
  assert.equal(p.future, true);
  assert.equal(p.generated, 0);
  assert.equal(p.missing, 2);
  assert.equal(run([lease(1)], []).future, false);
  assert.equal(run([lease(1)], [], { month: '2026-09' }).future, false);
});

check('an invalid month yields an empty preview instead of throwing', () => {
  for (const month of ['', '2026-13', '2026-1', 'abc', '2026/10']) {
    const p = run([lease(1)], [], { month });
    assert.equal(p.total, 0);
    assert.deepEqual(p.missingLines, []);
  }
});

check('junk rows are ignored, not fatal', () => {
  const contracts = [lease(1, { tenant: null, unit: null }), lease(2, { tenant: { name: '  ' }, unit: { unit_number: '' } })];
  const charges = [null, { contract_id: 'c9', type: 'RENT', due_date: null }, { contract_id: 'c9', type: 'RENT', due_date: 'soon' }, { contract_id: 'c9', type: undefined, due_date: '2026-10-01' }].filter(Boolean);
  const p = run(contracts, charges);
  assert.equal(p.missing, 2);
  assert.deepEqual(p.missingLines.map((l) => [l.tenantName, l.unitNumber]), [['مستأجر', null], ['مستأجر', null]]);
});

check('the missing list follows shop order, numbers by value, no shop last', () => {
  const contracts = [lease(1, { unit: { unit_number: '10' } }), lease(2, { unit: { unit_number: '2' } }), lease(3, { unit: null }), lease(4, { unit: { unit_number: 'A-1' } }), lease(5, { unit: { unit_number: '1' } })];
  assert.deepEqual(ids(run(contracts, [])), ['c5', 'c2', 'c1', 'c4', 'c3']);
});

check('the inputs are not changed', () => {
  const contracts = [lease(1, { services_amount: '10' }), lease(2)];
  const charges = [charge('c1', 'RENT', '2026-10')];
  const exemptMonths = [{ tenant_id: 't2', month_key: '2026-10' }];
  const before = JSON.stringify({ contracts, charges, exemptMonths });
  run(contracts, charges, { exemptMonths });
  assert.equal(JSON.stringify({ contracts, charges, exemptMonths }), before);
});

check('a full mall stays fast', () => {
  const contracts = Array.from({ length: 400 }, (_, i) => lease(i + 1, { services_amount: '50' }));
  const charges = [];
  for (const c of contracts) for (let m = 1; m <= 24; m++) charges.push(charge(c.id, 'RENT', `${m <= 12 ? 2025 : 2026}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`));
  const t = Date.now();
  const p = run(contracts, charges);
  assert.ok(Date.now() - t < 500);
  assert.equal(p.total, 400);
});

check('month arithmetic and the months the run can be pointed at', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-03', -15), '2024-12');
  assert.equal(shiftMonth('bad', 1), 'bad');
  const options = billingMonthOptions('2026-10-18');
  assert.equal(options.length, 14);
  assert.equal(options[0], '2026-11');
  assert.equal(options[1], '2026-10');
  assert.equal(options.at(-1), '2025-10');
  assert.deepEqual(billingExemptWindow('2026-10-18'), { from: '2025-10', to: '2026-11' });
  assert.equal(billingExemptWindow('x'), null);
  assert.ok(isMonthKey('2026-10') && !isMonthKey('2026-00') && !isMonthKey(null));
});

const open = { start_date: '2026-10-01', end_date: '2026-12-31', is_closed: false };
const closedUntilSep = { start_date: '2026-01-01', end_date: '2026-09-30', is_closed: true };

check('closed period: a month in an open period posts normally', () => {
  assert.equal(billingPostingRule({ month: '2026-10', today: TODAY, periods: [closedUntilSep, open] }), 'open');
});

check('closed period: a closed month is dated today when today is open', () => {
  assert.equal(billingPostingRule({ month: '2026-08', today: TODAY, periods: [closedUntilSep, open] }), 'dated-today');
  assert.equal(billingPostingRule({ month: '2026-09', today: TODAY, periods: [closedUntilSep, open] }), 'dated-today');
});

check('closed period: it is refused when today is closed too', () => {
  const wholeYear = { start_date: '2026-01-01', end_date: '2026-12-31', is_closed: true };
  assert.equal(billingPostingRule({ month: '2026-08', today: TODAY, periods: [wholeYear] }), 'blocked');
  assert.equal(billingPostingRule({ month: '2026-10', today: TODAY, periods: [wholeYear] }), 'blocked');
});

check('closed period: only the first day of the month decides, boundaries are inclusive', () => {
  assert.equal(billingPostingRule({ month: '2026-10', today: TODAY, periods: [{ start_date: '2026-10-01', end_date: '2026-10-01', is_closed: true }] }), 'dated-today');
  assert.equal(billingPostingRule({ month: '2026-10', today: TODAY, periods: [{ start_date: '2026-09-01', end_date: '2026-09-30', is_closed: true }] }), 'open');
  assert.equal(billingPostingRule({ month: '2026-10', today: '2026-10-01', periods: [{ start_date: '2026-10-01', end_date: '2026-10-31', is_closed: true }] }), 'blocked');
});

check('closed period: unknown or empty periods never block', () => {
  assert.equal(billingPostingRule({ month: '2026-08', today: TODAY, periods: [] }), 'open');
  assert.equal(billingPostingRule({ month: '2026-08', today: TODAY, periods: [{ ...closedUntilSep, is_closed: false }] }), 'open');
  assert.equal(billingPostingRule({ month: 'oops', today: TODAY, periods: [closedUntilSep] }), 'open');
});

check('the run result is read as the server sent it', () => {
  assert.deepEqual(parseBillingRunResult({ ok: true, month: '2026-10', rent_created: 14, service_created: 2, created: 16 }), { month: '2026-10', rentCreated: 14, serviceCreated: 2, created: 16 });
  assert.deepEqual(parseBillingRunResult({ created: 0, rent_created: 0, service_created: 0 }), { month: null, rentCreated: 0, serviceCreated: 0, created: 0 });
  assert.deepEqual(parseBillingRunResult({ rent_created: '3', service_created: 1 }), { month: null, rentCreated: 3, serviceCreated: 1, created: 4 });
  assert.equal(parseBillingRunResult({ created: 7 }).created, 7);
});

check('a run result the screen cannot understand is unknown, never "zero created"', () => {
  for (const bad of [null, undefined, [], 'ok', 5, {}, { ok: true }, { created: 'many' }, { created: -2 }, { created: NaN }, { rent_created: {} }]) {
    assert.equal(parseBillingRunResult(bad), null);
  }
});

check('count line reads «وُلِّد 52 من 68 عقداً · ناقص 16» with the right noun form', () => {
  assert.equal(billingCountLine({ total: 68, generated: 52, missing: 16 }), 'وُلِّد 52 من 68 عقداً · ناقص 16');
  assert.equal(billingCountLine({ total: 68, generated: 68, missing: 0 }), 'وُلِّد 68 من 68 عقداً');
  assert.equal(billingCountLine({ total: 1, generated: 0, missing: 1 }), 'وُلِّد 0 من عقد واحد · ناقص 1');
  assert.equal(billingCountLine({ total: 2, generated: 1, missing: 1 }), 'وُلِّد 1 من عقدين · ناقص 1');
  assert.equal(billingCountLine({ total: 5, generated: 4, missing: 1 }), 'وُلِّد 4 من 5 عقود · ناقص 1');
  assert.equal(billingCountLine({ total: 0, generated: 0, missing: 0 }), 'لا عقود تُطالَب في هذا الشهر');
});

check('dashboard row: title names the month, detail counts against the total and adds the value and earlier months', () => {
  assert.equal(billingFollowUpTitle('2026-10'), 'شهر أكتوبر 2026 لم تُولَّد مطالباته كاملة');
  const base = { count: 16, amount: 28400, billing: { total: 68, earlierMonths: 0 } };
  assert.equal(billingFollowUpDetail(base), `ناقص 16 من 68 عقداً · قيمتها في العقود ${formatMoney(28400, 'LYD')}`);
  assert.equal(billingFollowUpDetail({ ...base, amount: null }), 'ناقص 16 من 68 عقداً');
  assert.ok(billingFollowUpDetail({ ...base, billing: { total: 68, earlierMonths: 1 } }).endsWith(' · وشهر سابق ناقص أيضاً'));
  assert.ok(billingFollowUpDetail({ ...base, billing: { total: 68, earlierMonths: 2 } }).endsWith(' · وشهران سابقان ناقصان أيضاً'));
  assert.equal(billingFollowUpDetail({ count: 2, amount: null, billing: { total: 2, earlierMonths: 0 } }), 'ناقص 2 من عقدين');
});

check('run summary states only what the server created', () => {
  assert.equal(billingRunHeadline({ created: 0, rentCreated: 0, serviceCreated: 0, month: null }), 'لم يُنشئ النظام مطالبات جديدة');
  assert.equal(billingRunHeadline({ created: 1, rentCreated: 1, serviceCreated: 0, month: null }), 'أنشأ النظام مطالبة واحدة');
  assert.equal(billingRunHeadline({ created: 2, rentCreated: 1, serviceCreated: 1, month: null }), 'أنشأ النظام مطالبتين');
  assert.equal(billingRunHeadline({ created: 5, rentCreated: 5, serviceCreated: 0, month: null }), 'أنشأ النظام 5 مطالبات');
  assert.equal(billingRunHeadline({ created: 16, rentCreated: 14, serviceCreated: 2, month: null }), 'أنشأ النظام 16 مطالبة');
  assert.equal(billingRunBreakdown({ created: 16, rentCreated: 14, serviceCreated: 2, month: null }), 'إيجار 14 · خدمات 2');
  assert.equal(billingRunBreakdown({ created: 5, rentCreated: 5, serviceCreated: 0, month: null }), 'إيجار 5');
  assert.equal(billingRunBreakdown({ created: 0, rentCreated: 0, serviceCreated: 0, month: null }), null);
});

check('what is left after a run, and the ended-lease warning, agree in number', () => {
  assert.equal(billingLeftLine(1), 'بقي عقد واحد دون مطالبة');
  assert.equal(billingLeftLine(2), 'بقي عقدان دون مطالبة');
  assert.equal(billingLeftLine(3), 'بقي 3 عقود دون مطالبة');
  assert.equal(billingLeftLine(16), 'بقي 16 عقداً دون مطالبة');
  assert.ok(billingEndedActiveNote(1).startsWith('عقد نشط انتهت مدته') && billingEndedActiveNote(1).includes('وليس'));
  assert.ok(billingEndedActiveNote(2).startsWith('عقدان نشطان') && billingEndedActiveNote(2).includes('وليسا'));
  assert.ok(billingEndedActiveNote(3).startsWith('3 عقود نشطة') && billingEndedActiveNote(3).includes('وليست'));
  assert.ok(billingEndedActiveNote(12).startsWith('12 عقداً نشطاً'));
});

check('the latest incomplete month and when it counts as late', () => {
  const m = (month, missing) => ({ month, total: 10, generated: 10 - missing, missing, missingAmount: missing * 100, complete: missing === 0 });
  assert.equal(latestIncompleteMonth([m('2026-08', 0), m('2026-09', 0), m('2026-10', 0)], TODAY), null);
  const both = latestIncompleteMonth([m('2026-08', 0), m('2026-09', 2), m('2026-10', 3)], TODAY);
  assert.equal(both.status.month, '2026-10');
  assert.equal(both.earlierMonths, 1);
  const past = latestIncompleteMonth([m('2026-08', 1), m('2026-09', 2), m('2026-10', 0)], TODAY);
  assert.equal(past.status.month, '2026-09');
  assert.equal(past.earlierMonths, 1);
  // a month that has not begun is not late
  assert.equal(latestIncompleteMonth([m('2026-10', 0), m('2026-11', 9)], TODAY), null);
  const onlyCurrent = latestIncompleteMonth([m('2026-09', 0), m('2026-10', 4)], '2026-10-02');
  assert.equal(billingIsLate(onlyCurrent, '2026-10-02'), false);
  assert.equal(billingIsLate(onlyCurrent, '2026-10-05'), true);
  assert.equal(billingIsLate(latestIncompleteMonth([m('2026-09', 4), m('2026-10', 0)], '2026-10-01'), '2026-10-01'), true);
});

check('every month the dashboard and the strip read lies inside the window the queries fetch', () => {
  for (const today of ['2026-01-01', '2026-02-28', '2026-10-18', '2026-12-31', '2024-02-29']) {
    const w = billingExemptWindow(today);
    const wanted = [...recentBillingMonths(today), ...billingMonthOptions(today)];
    for (const m of wanted) assert.ok(m >= w.from && m <= w.to, `${m} outside ${w.from}..${w.to} for ${today}`);
  }
});

check('a leap day counts: a lease starting on 29 February belongs to February, not to the month before', () => {
  const p = (month) => buildBillingPreview({ contracts: [lease(1, { start_date: '2024-02-29' })], charges: [], month, today: '2024-03-10' });
  assert.equal(p('2024-02').total, 1);
  assert.equal(p('2024-01').total, 0);
  const ends = (month) => buildBillingPreview({ contracts: [lease(1, { start_date: '2023-01-01', end_date: '2024-02-29' })], charges: [], month, today: '2024-03-10' });
  assert.equal(ends('2024-02').total, 1);
  assert.equal(ends('2024-03').total, 0);
  assert.equal(ends('2024-03').endedActive, 1);
});

check('the same charge twice never makes a lease more than generated', () => {
  const contracts = [lease(1, { services_amount: '10' }), lease(2)];
  const charges = [charge('c1', 'RENT', '2026-10'), charge('c1', 'RENT', '2026-10'), charge('c1', 'SERVICE', '2026-10'), charge('c1', 'SERVICE', '2026-10')];
  const p = run(contracts, charges);
  assert.equal(p.total, 2);
  assert.equal(p.generated, 1);
  assert.equal(p.missing, 1);
});

check('amounts add up exactly to three decimals, never 0.30000000000000004', () => {
  const p = run([lease(1, { monthly_rent: '0.1' }), lease(2, { monthly_rent: '0.2' })], []);
  assert.equal(p.missingAmount, 0.3);
  const q = run([lease(1, { monthly_rent: '1000.125', services_amount: '0.0004' }), lease(2, { monthly_rent: '250.5' })], []);
  assert.equal(q.missingAmount, 1250.625);
});

check('two leases of an exempt tenant: no rent anywhere, each lease keeps its own service', () => {
  const contracts = [lease(1, { id: 'a', tenant_id: 'T', services_amount: '40' }), lease(2, { id: 'b', tenant_id: 'T', start_date: '2026-06-01' })];
  const p = run(contracts, [], { exemptMonths: [{ tenant_id: 'T', month_key: '2026-10' }] });
  assert.deepEqual(ids(p), ['a']);
  assert.equal(p.exemptTenants, 1);
  assert.equal(p.unpriced, 0);
  assert.equal(p.missingAmount, 40);
});

check('equal start dates: the rent goes to the lease with the lowest id, every time', () => {
  const a = lease(1, { id: 'a', tenant_id: 'T', start_date: '2026-01-01' });
  const b = lease(2, { id: 'b', tenant_id: 'T', start_date: '2026-01-01' });
  assert.deepEqual(ids(run([a, b], [])), ['a']);
  assert.deepEqual(ids(run([b, a], [])), ['a']);
});

check('whatever the data, generated + missing is the total and the list matches the count', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let round = 0; round < 60; round++) {
    const contracts = Array.from({ length: 1 + Math.floor(rnd() * 12) }, (_, i) =>
      lease(i + 1, {
        tenant_id: `t${1 + Math.floor(rnd() * 6)}`,
        status: rnd() < 0.15 ? 'EXPIRED' : 'ACTIVE',
        start_date: rnd() < 0.2 ? '2026-12-01' : '2025-01-01',
        end_date: rnd() < 0.2 ? '2026-05-31' : null,
        monthly_rent: rnd() < 0.2 ? '0' : String(500 + Math.floor(rnd() * 5) * 100),
        services_amount: rnd() < 0.4 ? String(Math.floor(rnd() * 90)) : null,
      }),
    );
    const charges = [];
    for (const c of contracts) {
      if (rnd() < 0.5) charges.push(charge(c.id, 'RENT', '2026-10'));
      if (rnd() < 0.5) charges.push(charge(c.id, 'SERVICE', '2026-10'));
    }
    const exemptMonths = rnd() < 0.5 ? [{ tenant_id: 't1', month_key: '2026-10' }] : [];
    const p = run(contracts, charges, { exemptMonths });
    assert.equal(p.generated + p.missing, p.total);
    assert.equal(p.missingLines.length, p.missing);
    assert.equal(p.complete, p.missing === 0);
    assert.ok(p.missingAmount >= 0);
    for (const l of p.missingLines) assert.ok(l.missingRent != null || l.missingService != null);
    for (const m of p.recent) assert.equal(m.generated + m.missing, m.total);
  }
});

console.log(`\n${passed} checks passed`);
