/**
 * The figures behind the employee screens, with no database: months, the five figures of a profile, the status,
 * the merged history, the year of leave as a strip, the check a leave request goes through, the months a bonus or
 * deduction can go to, and the directory rows with their filters and totals.
 *   npx tsx scripts/verify-employee-profile.mjs
 */
import assert from 'node:assert/strict';

const P = await import('../src/lib/employees/employee-profile.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

// 2026-10-19 is a Monday. The weekend is Friday and Saturday.
const TODAY = '2026-10-19';
const struct = (id, from, base, extra = {}) => ({ id, effective_from: from, base_salary: String(base), housing_allowance: '0', transport_allowance: '0', other_allowance: '0', notes: null, ...extra });
const line = (id, month, net, paid, status = 'POSTED') => ({ id, period_month: month, run_status: status, net: String(net), paid: String(paid), outstanding: String(net - paid) });
const advance = (over = {}) => ({ id: 'ad-1', issued_on: '2026-08-10', amount: '1500', installments: 3, installment_amount: '500', reason: 'ظرف عائلي', status: 'OPEN', repaid: '500', remaining: '1000', cancel_reason: null, created_at: '2026-08-10T09:00:00Z', ...over });
const leave = (id, type, start, end, status = 'APPROVED', over = {}) => ({
  id, employee_id: 'e-0', leave_type: type, start_date: start, end_date: end, days: 5, status, reason: null, decision_note: null,
  decided_by: null, decided_at: null, override_note: null, original_end_date: null, cancelled_by: null, cancelled_at: null, cancel_reason: null,
  created_by: null, created_at: '2026-01-01T09:00:00Z', ...over,
});

// ── months ──────────────────────────────────────────────────────────────────

check('a month key is read from a month, a date or a timestamp, and from nothing else', () => {
  assert.equal(P.monthKeyOf('2026-10'), '2026-10');
  assert.equal(P.monthKeyOf('2026-10-01'), '2026-10');
  assert.equal(P.monthKeyOf('2026-10-01T09:00:00Z'), '2026-10');
  for (const bad of ['', null, undefined, '2026-13', '2026-00-01', 'أكتوبر', '26-10']) assert.equal(P.monthKeyOf(bad), '');
});

check('the last twelve months end with this month and cross the year', () => {
  const keys = P.lastMonthKeys(TODAY, 12);
  assert.equal(keys.length, 12);
  assert.equal(keys[0], '2025-11');
  assert.equal(keys[11], '2026-10');
  assert.deepEqual(P.lastMonthKeys('2026-02-10', 3), ['2025-12', '2026-01', '2026-02']);
  assert.deepEqual(P.lastMonthKeys('nonsense'), []);
});

check('shifting a month goes both ways across a year', () => {
  assert.equal(P.shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(P.shiftMonthKey('2026-12', 1), '2027-01');
  assert.equal(P.shiftMonthKey('2026-10-01', 3), '2027-01');
  assert.equal(P.shiftMonthKey('x', 1), '');
});

// ── salary structure and the figures ────────────────────────────────────────

check('the structure in force is the latest one that has started, not the newest row', () => {
  const rows = [struct('a', '2024-03-01', 2000), struct('b', '2026-05-01', 2400), struct('c', '2026-11-01', 2600)];
  assert.equal(P.structureInForce(rows, '2026-10').id, 'b');
  assert.equal(P.structureInForce(rows, '2026-11').id, 'c');
  assert.equal(P.structureInForce(rows, '2024-02'), null);
  assert.equal(P.structureComingNext(rows, '2026-10').id, 'c');
  assert.equal(P.structureComingNext(rows, '2026-11'), null);
  assert.equal(P.structureInForce([], '2026-10'), null);
});

check('a structure total adds the allowances and survives text and blanks', () => {
  assert.equal(P.structureTotalOf(struct('a', '2026-01-01', '1950', { housing_allowance: '200', transport_allowance: '100.5', other_allowance: null })), 2250.5);
  assert.equal(P.structureTotalOf(null), 0);
  assert.equal(P.structureTotalOf(struct('a', '2026-01-01', 'abc')), 0);
});

check('the salary figure comes from the structure, then the contact card, and says which', () => {
  const kpi = (structures, card) => P.buildEmployeeKpis({ structures, lines: [], advances: [], cardSalary: card, today: TODAY }).salary;
  assert.deepEqual(kpi([struct('a', '2026-03-01', 2250)], '9999'), { total: 2250, since: '2026-03', source: 'structure', coming: null });
  assert.deepEqual(kpi([], '1800'), { total: 1800, since: null, source: 'card', coming: null });
  assert.deepEqual(kpi([], null), { total: 0, since: null, source: 'none', coming: null });
  assert.deepEqual(kpi([], 'x'), { total: 0, since: null, source: 'none', coming: null });
  const raise = kpi([struct('a', '2026-03-01', 2250), struct('b', '2026-12-01', 2500)], null);
  assert.equal(raise.total, 2250);
  assert.deepEqual(raise.coming, { total: 2500, from: '2026-12' });
});

check('net of the last twelve months counts posted lines inside the window only', () => {
  const lines = [
    line('l1', '2026-10', 2250, 2250),
    line('l2', '2026-09', 2400, 1900),
    line('l3', '2025-11', 2000, 2000), // the oldest month of the window
    line('l4', '2025-10', 2000, 2000), // one month too old
    line('l5', '2026-11-01', 9999, 0, 'DRAFT'), // not posted, and in the future
    line('l6', '2026-08-01', 1000, 1000, 'APPROVED'), // approved but not posted
  ];
  const k = P.buildEmployeeKpis({ structures: [], lines, advances: [], today: TODAY });
  assert.equal(k.netYear.total, 2250 + 2400 + 2000);
  assert.equal(k.netYear.months, 3);
});

check('what is due counts posted months with something left, oldest first, and ignores drafts', () => {
  const lines = [
    line('l1', '2026-10', 2250, 2250),
    line('l2', '2026-09-01', 2400, 1900),
    line('l3', '2026-08', 2250, 0),
    line('l4', '2026-11', 2250, 0, 'DRAFT'),
  ];
  const k = P.buildEmployeeKpis({ structures: [], lines, advances: [], today: TODAY });
  assert.equal(k.due.total, 2750);
  assert.equal(k.due.months, 2);
  assert.equal(k.due.oldestMonth, '2026-08');
  assert.equal(k.due.oldestLineId, 'l3');
  assert.deepEqual(P.outstandingLinesOf(lines).map((l) => l.id), ['l3', 'l2']);
});

check('nothing due is zero and has no oldest month', () => {
  const k = P.buildEmployeeKpis({ structures: [], lines: [line('l1', '2026-10', 2250, 2250)], advances: [], today: TODAY });
  assert.deepEqual(k.due, { total: 0, months: 0, oldestMonth: null, oldestLineId: null });
});

check('the advance balance counts open advances only and the instalment never exceeds what is left', () => {
  const k = P.buildEmployeeKpis({
    structures: [],
    lines: [],
    advances: [
      advance(),
      advance({ id: 'ad-2', remaining: '200' }),
      advance({ id: 'ad-3', status: 'SETTLED', remaining: '0' }),
      advance({ id: 'ad-4', status: 'CANCELLED', remaining: '700' }),
    ],
    today: TODAY,
  });
  assert.deepEqual(k.advance, { balance: 1200, open: 2, monthly: 700 });
  const none = P.buildEmployeeKpis({ structures: [], lines: [], advances: [], today: TODAY });
  assert.deepEqual(none.advance, { balance: 0, open: 0, monthly: 0 });
});

check('figures survive garbage values: text, nulls and a missing breakdown', () => {
  const k = P.buildEmployeeKpis({
    structures: [struct('a', 'bad-date', 'abc')],
    lines: [{ id: 'x', period_month: null, run_status: 'POSTED', net: null, paid: undefined, outstanding: 'oops' }],
    advances: [advance({ remaining: null })],
    cardSalary: undefined,
    today: TODAY,
  });
  assert.equal(k.salary.source, 'none');
  assert.equal(k.netYear.total, 0);
  assert.equal(k.due.total, 0);
  assert.equal(k.advance.balance, 0);
});

check('the register series fills every month of the year, and sums two lines of one month', () => {
  const s = P.payrollSeries([line('a', '2026-10', 100, 40), line('b', '2026-10-01', 50, 50), line('c', '2026-08', 10, 0, 'DRAFT')], TODAY);
  assert.equal(s.length, 12);
  assert.deepEqual(s[11], { month: '2026-10', net: 150, paid: 90 });
  assert.deepEqual(s[9], { month: '2026-08', net: 0, paid: 0 });
});

// ── status ──────────────────────────────────────────────────────────────────

check('status: an end of service beats everything, then inactive, then leave, then working', () => {
  const st = (over) => P.employeeStatus({ isActive: true, today: TODAY, ...over });
  assert.equal(st({}).key, 'working');
  assert.equal(st({ onLeave: true }).key, 'on_leave');
  assert.equal(st({ isActive: false, onLeave: true }).key, 'inactive');
  assert.equal(st({ terminationDate: '2026-10-01', onLeave: true }).key, 'ended');
  assert.equal(st({ terminationDate: '2026-10-19' }).key, 'working', 'the last day of service is still a working day');
  assert.equal(st({ terminationDate: '2026-12-31' }).key, 'working');
  assert.equal(st({ terminationDate: '2026-10-01' }).tone, 'danger');
});

// ── history ─────────────────────────────────────────────────────────────────

const adjustment = (id, kind, status, over = {}) => ({ id, kind, amount: '150', days: null, reason: 'سبب', status, period_month: '2026-09', decided_at: null, decision_note: null, created_at: '2026-09-24T09:00:00Z', ...over });

check('the history lists each fact once, newest first', () => {
  const entries = P.buildTimeline({
    hireDate: '2024-03-01',
    structures: [struct('s1', '2024-03-01', 2000), struct('s2', '2026-03-01', 2250)],
    adjustments: [adjustment('a1', 'BONUS', 'APPROVED', { decided_at: '2026-09-25T09:00:00Z' }), adjustment('a2', 'ABSENCE', 'DRAFT', { created_at: '2026-10-15T09:00:00Z' })],
    advances: [advance()],
    leaves: [leave('l1', 'ANNUAL', '2026-02-01', '2026-02-05', 'APPROVED', { created_at: '2026-01-18T09:00:00Z', decided_at: '2026-01-23T09:00:00Z' })],
  });
  assert.deepEqual(
    entries.map((e) => `${e.day} ${e.type}`),
    [
      '2026-10-15 adjustment',
      '2026-09-25 adjustment_decided',
      '2026-09-24 adjustment',
      '2026-08-10 advance',
      '2026-03-01 salary',
      '2026-01-23 leave_decided',
      '2026-01-18 leave',
      '2024-03-01 salary',
      '2024-03-01 hired',
    ],
  );
  assert.equal(new Set(entries.map((e) => e.key)).size, entries.length, 'keys are unique');
});

check('a raise shows how far the total moved; the first structure shows nothing to compare', () => {
  const entries = P.buildTimeline({ structures: [struct('s1', '2024-03-01', 2000), struct('s2', '2026-03-01', 2250, { housing_allowance: '100' })], adjustments: [], advances: [], leaves: [] });
  const bySalary = Object.fromEntries(entries.map((e) => [e.key, e]));
  assert.equal(bySalary['salary-s2'].delta, 350);
  assert.equal(bySalary['salary-s2'].amount, 2350);
  assert.equal(bySalary['salary-s1'].delta, null);
});

check('a bonus adds and a deduction takes away; a cancelled one goes quiet', () => {
  const entries = P.buildTimeline({
    structures: [],
    adjustments: [adjustment('a1', 'BONUS', 'APPROVED'), adjustment('a2', 'PENALTY', 'APPROVED'), adjustment('a3', 'OVERTIME', 'CANCELLED')],
    advances: [],
    leaves: [],
  });
  const by = Object.fromEntries(entries.map((e) => [e.key, e]));
  assert.equal(by['adj-a1'].direction, 'in');
  assert.equal(by['adj-a1'].tone, 'success');
  assert.equal(by['adj-a2'].direction, 'out');
  assert.equal(by['adj-a2'].tone, 'danger');
  assert.equal(by['adj-a3'].tone, 'neutral');
  assert.equal(by['adj-a1'].amount, 150);
});

check('a leave that was approved and later cancelled shows all three steps in order', () => {
  const entries = P.buildTimeline({
    structures: [],
    adjustments: [],
    advances: [],
    leaves: [
      leave('l1', 'SICK', '2026-10-10', '2026-10-12', 'CANCELLED', {
        created_at: '2026-10-01T09:00:00Z',
        decided_at: '2026-10-02T09:00:00Z',
        cancelled_at: '2026-10-05T09:00:00Z',
      }),
    ],
  });
  assert.deepEqual(entries.map((e) => e.type), ['leave_cancelled', 'leave_decided', 'leave']);
});

check('a rejected request is one request and one rejection', () => {
  const entries = P.buildTimeline({
    structures: [],
    adjustments: [],
    advances: [],
    leaves: [leave('l1', 'ANNUAL', '2026-10-10', '2026-10-12', 'REJECTED', { created_at: '2026-10-01T09:00:00Z', decided_at: '2026-10-02T09:00:00Z', decision_note: 'ضغط عمل' })],
  });
  assert.deepEqual(entries.map((e) => [e.type, e.tone]), [['leave_decided', 'danger'], ['leave', 'info']]);
});

check('a leave ended early gets its own entry on its last day; a plain one and a cancelled one do not', () => {
  const entries = P.buildTimeline({
    structures: [],
    adjustments: [],
    advances: [],
    leaves: [
      leave('l1', 'ANNUAL', '2026-10-05', '2026-10-14', 'APPROVED', { created_at: '2026-10-01T09:00:00Z', decided_at: '2026-10-01T09:00:00Z', original_end_date: '2026-10-22' }),
      leave('l2', 'SICK', '2026-09-01', '2026-09-03', 'APPROVED', { created_at: '2026-08-30T09:00:00Z', decided_at: '2026-08-31T09:00:00Z' }),
      // shortened first, cancelled later: two facts, and the cancellation is not called an early return
      leave('l3', 'ANNUAL', '2026-08-02', '2026-08-04', 'CANCELLED', { created_at: '2026-07-20T09:00:00Z', decided_at: '2026-07-21T09:00:00Z', cancelled_at: '2026-08-06T09:00:00Z', original_end_date: '2026-08-10' }),
    ],
  });
  const shortened = entries.filter((e) => e.type === 'leave_shortened');
  assert.deepEqual(shortened.map((e) => [e.key, e.day]), [['leave-shortened-l1', '2026-10-14'], ['leave-shortened-l3', '2026-08-04']]);
  assert.equal(entries.filter((e) => e.type === 'leave_cancelled').length, 1);
  assert.equal(entries.some((e) => e.key === 'leave-shortened-l2'), false);
  // an end that equals the original is not a shortening
  const same = P.buildTimeline({ structures: [], adjustments: [], advances: [], leaves: [leave('l4', 'ANNUAL', '2026-10-05', '2026-10-14', 'APPROVED', { original_end_date: '2026-10-14' })] });
  assert.equal(same.some((e) => e.type === 'leave_shortened'), false);
});

check('entries on one day keep the time order, and rows without a date are dropped', () => {
  const entries = P.buildTimeline({
    structures: [],
    adjustments: [adjustment('a1', 'BONUS', 'DRAFT', { created_at: '2026-09-24T08:00:00Z' }), adjustment('a2', 'BONUS', 'DRAFT', { created_at: '2026-09-24T11:00:00Z' }), adjustment('a3', 'BONUS', 'DRAFT', { created_at: '' })],
    advances: [],
    leaves: [],
  });
  assert.deepEqual(entries.map((e) => e.key), ['adj-a2', 'adj-a1']);
});

check('an empty file has an empty history', () => {
  assert.deepEqual(P.buildTimeline({ structures: [], adjustments: [], advances: [], leaves: [] }), []);
  assert.deepEqual(P.buildTimeline({ hireDate: 'nonsense', structures: [], adjustments: [], advances: [], leaves: [] }), []);
});

check('the history groups by month and keeps the order', () => {
  const entries = P.buildTimeline({
    structures: [struct('s1', '2026-03-01', 2250)],
    adjustments: [adjustment('a1', 'BONUS', 'DRAFT', { created_at: '2026-09-24T09:00:00Z' }), adjustment('a2', 'BONUS', 'DRAFT', { created_at: '2026-09-02T09:00:00Z' })],
    advances: [],
    leaves: [],
  });
  const groups = P.groupTimelineByMonth(entries);
  assert.deepEqual(groups.map((g) => [g.month, g.entries.length]), [['2026-09', 2], ['2026-03', 1]]);
});

// ── the year of leave ───────────────────────────────────────────────────────

check('the year strip counts working days per month and leaves out cancelled and rejected leave', () => {
  const strip = P.leaveYearStrip(
    [
      leave('a', 'ANNUAL', '2026-02-01', '2026-02-05', 'APPROVED'), // Sun-Thu: 5
      leave('b', 'SICK', '2026-02-08', '2026-02-09', 'APPROVED'), // Sun-Mon: 2
      leave('c', 'ANNUAL', '2026-03-01', '2026-03-05', 'PENDING'),
      leave('d', 'ANNUAL', '2026-04-05', '2026-04-09', 'CANCELLED'),
      leave('e', 'ANNUAL', '2026-05-03', '2026-05-07', 'REJECTED'),
    ],
    2026,
  );
  assert.equal(strip.length, 12);
  assert.deepEqual([strip[1].approved, strip[1].pending, strip[1].topType], [7, 0, 'ANNUAL']);
  assert.deepEqual(strip[1].byType, { ANNUAL: 5, SICK: 2 });
  assert.deepEqual([strip[2].approved, strip[2].pending, strip[2].topType], [0, 5, 'ANNUAL']);
  assert.deepEqual([strip[3].approved, strip[3].pending, strip[3].topType], [0, 0, null]);
  assert.deepEqual([strip[4].approved, strip[4].pending, strip[4].topType], [0, 0, null]);
});

check('a leave over the new year counts in each year only for the days inside it', () => {
  // Thu 31 Dec 2026 and Sun 3 Jan - Thu 7 Jan 2027: Fri 1 and Sat 2 January are the weekend.
  const rows = [leave('a', 'ANNUAL', '2026-12-31', '2027-01-07', 'APPROVED')];
  const y26 = P.leaveYearStrip(rows, 2026);
  const y27 = P.leaveYearStrip(rows, 2027);
  assert.equal(y26[11].approved, 1);
  assert.equal(y26[0].approved, 0);
  assert.equal(y27[0].approved, 5);
  assert.equal(y27[11].approved, 0);
});

check('an empty year is twelve empty months', () => {
  const strip = P.leaveYearStrip([], 2026);
  assert.equal(strip.length, 12);
  assert.ok(strip.every((c) => c.approved === 0 && c.pending === 0 && c.topType === null));
  assert.equal(strip[0].month, '2026-01');
  assert.equal(strip[11].month, '2026-12');
});

// ── checking a request ──────────────────────────────────────────────────────

const evaluate = (over) =>
  P.evaluateLeaveRequest({ requests: [], employeeId: 'e-0', type: 'ANNUAL', start: '2026-11-01', end: '2026-11-05', today: TODAY, annualDays: 30, carryOver: 0, carryOverYear: null, ...over });

check('a plain annual request is clear and shows the balance after it', () => {
  const r = evaluate({});
  assert.equal(r.days, 5);
  assert.equal(r.error, null);
  assert.equal(r.overlap, null);
  assert.equal(r.short, false);
  assert.equal(r.balanceAfter, 25);
});

check('the balance after counts approved and pending leave of the year and the carry-over of that year only', () => {
  const requests = [leave('a', 'ANNUAL', '2026-02-01', '2026-02-05', 'APPROVED'), leave('b', 'ANNUAL', '2026-03-01', '2026-03-05', 'PENDING')];
  assert.equal(evaluate({ requests }).balanceAfter, 30 - 5 - 5 - 5);
  assert.equal(evaluate({ requests, carryOver: 4, carryOverYear: 2026 }).balanceAfter, 30 + 4 - 15);
  assert.equal(evaluate({ requests, carryOver: 4, carryOverYear: 2025 }).balanceAfter, 30 - 15, 'last year\'s carry-over does not count');
  assert.equal(evaluate({ requests: [...requests, leave('c', 'ANNUAL', '2026-04-01', '2026-04-05', 'REJECTED')] }).balanceAfter, 15, 'rejected leave takes nothing');
});

check('a request that runs into another leave names it; a cancelled one does not count', () => {
  const requests = [leave('a', 'SICK', '2026-11-03', '2026-11-04', 'APPROVED')];
  const r = evaluate({ requests });
  assert.equal(r.overlap.id, 'a');
  assert.match(r.overlapMessage, /تتقاطع مع إجازة مرضية معتمدة/);
  assert.equal(evaluate({ requests: [leave('a', 'SICK', '2026-11-03', '2026-11-04', 'CANCELLED')] }).overlap, null);
  assert.equal(evaluate({ requests: [{ ...requests[0], employee_id: 'e-9' }] }).overlap, null, 'another employee\'s leave is not a clash');
});

check('an annual request over the balance is short and says by how much is available', () => {
  const requests = [leave('a', 'ANNUAL', '2026-02-01', '2026-09-30', 'APPROVED', { days: 28 })];
  // Feb through Sep, Sun-Thu: far more than 30 days, so the year is already used up.
  const r = evaluate({ requests, annualDays: 10 });
  assert.equal(r.short, true);
  assert.match(r.shortMessage, /رصيد الإجازة السنوية لا يكفي/);
  assert.ok(r.balanceAfter < 0);
});

check('only annual leave is held against the balance', () => {
  const r = evaluate({ type: 'SICK', annualDays: 0 });
  assert.equal(r.short, false);
  assert.equal(r.annual, null);
  assert.equal(r.balanceAfter, null);
  assert.equal(evaluate({ type: 'UNPAID', annualDays: 0 }).short, false);
});

check('a leave over the new year is checked against each year', () => {
  const r = evaluate({ start: '2026-12-27', end: '2027-01-07', annualDays: 30 });
  assert.equal(r.annual.years.length, 2);
  assert.equal(r.annual.years[0].year, 2026);
  assert.equal(r.annual.years[1].year, 2027);
});

check('wrong dates give a reason and no days', () => {
  assert.equal(evaluate({ start: '2026-11-05', end: '2026-11-01' }).days, 0);
  assert.match(evaluate({ start: '2026-11-05', end: '2026-11-01' }).error, /قبل/);
  assert.match(evaluate({ start: '2026-10-23', end: '2026-10-24' }).error, /عطلة/);
  assert.match(evaluate({ start: '', end: '' }).error, /حدّد/);
  assert.match(evaluate({ type: 'OTHER', reason: '' }).error, /سبب/);
  assert.equal(evaluate({ type: 'OTHER', reason: 'مراجعة مستشفى' }).error, null);
  assert.match(evaluate({ hireDate: '2026-12-01' }).error, /قبل تاريخ تعيين/);
  assert.match(evaluate({ terminationDate: '2026-11-02' }).error, /بعد تاريخ انتهاء خدمة/);
});

// ── unpaid leave and its deduction ──────────────────────────────────────────

check('the deduction for an unpaid leave is worked out month by month from the salary of that month', () => {
  // Sun 25 Oct - Thu 5 Nov 2026: October from the 25th to the 31st (Fri 30 and Sat 31 are rest days inside the leave), November 1-5.
  const structures = [struct('a', '2024-01-01', 3000), struct('b', '2026-11-01', 6000)];
  const plan = P.unpaidDeductionPlan(leave('u', 'UNPAID', '2026-10-25', '2026-11-05'), structures);
  assert.deepEqual(plan.map((p) => p.month), ['2026-10', '2026-11']);
  assert.equal(plan[0].days, 7);
  assert.equal(plan[0].total, 700, '7 days at 3000 / 30');
  assert.equal(plan[1].days, 5);
  assert.equal(plan[1].total, 1000, '5 days at 6000 / 30: the raise applies from November');
});

check('a whole month of unpaid leave takes the whole salary, and no structure leaves the amount empty', () => {
  const whole = P.unpaidDeductionPlan(leave('u', 'UNPAID', '2026-11-01', '2026-11-30'), [struct('a', '2024-01-01', 3000)]);
  assert.deepEqual(whole, [{ month: '2026-11', days: 30, total: 3000 }]);
  const none = P.unpaidDeductionPlan(leave('u', 'UNPAID', '2026-11-01', '2026-11-05'), []);
  assert.equal(none[0].total, 0);
  assert.deepEqual(P.unpaidDeductionPlan(leave('u', 'UNPAID', '2026-11-05', '2026-11-01'), [struct('a', '2024-01-01', 3000)]), []);
});

check('a deduction made for a leave is found by its reason, and a cancelled one does not count', () => {
  const l = leave('u', 'UNPAID', '2026-11-01', '2026-11-05');
  const reason = P.unpaidLeaveReason(l);
  assert.match(reason, /^إجازة بدون راتب /);
  const adj = (over) => ({ kind: 'ABSENCE', status: 'DRAFT', reason: `${reason}`, ...over });
  assert.equal(P.hasDeductionFor(l, [adj({})]), true);
  assert.equal(P.hasDeductionFor(l, [adj({ status: 'APPROVED' })]), true);
  assert.equal(P.hasDeductionFor(l, [adj({ status: 'CANCELLED' })]), false);
  assert.equal(P.hasDeductionFor(l, [adj({ kind: 'PENALTY' })]), false);
  assert.equal(P.hasDeductionFor(l, [adj({ reason: 'غياب بدون إذن' })]), false);
  assert.equal(P.hasDeductionFor(l, [adj({ reason: P.unpaidLeaveReason(leave('x', 'UNPAID', '2026-12-01', '2026-12-05')) })]), false, 'another leave');
  assert.equal(P.hasDeductionFor(l, []), false);
});

// ── months a bonus or deduction can go to ───────────────────────────────────

check('the months offered are three back and two ahead, and a posted month is flagged', () => {
  const choices = P.adjustmentMonthChoices(TODAY, new Set(['2026-08', '2026-09']));
  assert.deepEqual(choices.map((c) => c.month), ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  assert.deepEqual(choices.filter((c) => c.posted).map((c) => c.month), ['2026-08', '2026-09']);
  assert.ok(P.adjustmentMonthChoices(TODAY, new Set(), ['2025-12-01']).some((c) => c.month === '2025-12'), 'an asked-for month is added');
});

check('the default month is the preferred one when open, else the next open month', () => {
  const choices = P.adjustmentMonthChoices(TODAY, new Set(['2026-10']));
  assert.equal(P.defaultAdjustmentMonth(choices, '2026-09'), '2026-09');
  assert.equal(P.defaultAdjustmentMonth(choices, '2026-10'), '2026-11');
  const allPosted = P.adjustmentMonthChoices(TODAY, new Set(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']));
  assert.equal(P.defaultAdjustmentMonth(allPosted, '2026-10'), '2026-12');
});

// ── the directory ───────────────────────────────────────────────────────────

const contact = (id, name, over = {}) => ({ id, name, phone: '0911111111', job_title: 'محاسب', department: 'المالية', hire_date: '2024-03-01', salary: '2000', is_active: true, ...over });
const detailsOf = (id, over = {}) => ({
  employee_id: id, national_id: null, birth_date: null, employment_type: 'FULL_TIME', contract_end: null, probation_end: null, bank_name: null, bank_account: null,
  iban: null, emergency_name: null, emergency_phone: null, annual_leave_days: 30, leave_carry_over: 0, leave_carry_over_year: null, termination_date: null,
  termination_reason: null, notes: null, created_at: '', updated_at: '', ...over,
});

const directory = () =>
  P.buildDirectoryRows({
    contacts: [
      contact('e-0', 'أحمد سالم', { department: 'الأمن', job_title: 'مشرف أمن', salary: '2250' }),
      contact('e-1', 'خالد عمر', { department: 'الأمن', job_title: 'حارس', salary: '1400' }),
      contact('e-2', 'فاطمة علي', { salary: '2650' }),
      contact('e-3', 'محمد الطاهر', { department: 'الصيانة', salary: '1800' }),
      contact('e-4', 'سالم قديم', { is_active: false, salary: '1000' }),
    ],
    summaries: [{ id: 'e-0', last_12_months_salary_paid: '22500', months_with_payment: 10 }],
    outstanding: [
      { id: 'l1', employee_id: 'e-2', period_month: '2026-09', outstanding: '650', run_status: 'POSTED' },
      { id: 'l0', employee_id: 'e-2', period_month: '2026-08-01', outstanding: '100', run_status: 'POSTED' },
      { id: 'l2', employee_id: 'e-3', period_month: '2026-10', outstanding: '1800', run_status: 'DRAFT' },
    ],
    pendingAdjustments: [{ employee_id: 'e-2' }, { employee_id: 'e-2' }, { employee_id: 'e-0' }],
    advances: [
      { employee_id: 'e-3', status: 'OPEN', remaining: '1000', installment_amount: '500' },
      { employee_id: 'e-3', status: 'SETTLED', remaining: '0', installment_amount: '500' },
    ],
    onLeave: [{ employee_id: 'e-1', leave_type: 'SICK', end_date: '2026-10-22', return_date: '2026-10-25' }],
    details: [detailsOf('e-0', { contract_end: '2026-11-10' }), detailsOf('e-3', { probation_end: '2026-10-25' })],
    today: TODAY,
  });

check('directory rows join everything one employee has, and put active people first by name', () => {
  const rows = directory();
  assert.deepEqual(rows.map((r) => r.id), ['e-0', 'e-1', 'e-2', 'e-3', 'e-4']);
  assert.equal(rows[rows.length - 1].id, 'e-4', 'the inactive file is last');
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by['e-0'].paid12, 22500);
  assert.equal(by['e-0'].pendingItems, 1);
  assert.equal(by['e-2'].dueNow, 750);
  assert.equal(by['e-2'].dueMonths, 2);
  assert.equal(by['e-2'].dueLineId, 'l0', 'the oldest month is paid first');
  assert.equal(by['e-2'].pendingItems, 2);
  assert.equal(by['e-3'].dueNow, 0, 'a draft run owes nothing yet');
  assert.equal(by['e-3'].openAdvance, 1000);
  assert.equal(by['e-3'].openAdvances, 1);
  assert.deepEqual(by['e-1'].onLeave, { type: 'SICK', end: '2026-10-22', returnDate: '2026-10-25' });
  assert.equal(by['e-1'].status.key, 'on_leave');
  assert.equal(by['e-4'].status.key, 'inactive');
});

check('the file alert on a row is the most urgent date, if any', () => {
  const by = Object.fromEntries(directory().map((r) => [r.id, r]));
  assert.equal(by['e-0'].alert.key, 'contract_end');
  assert.equal(by['e-3'].alert.key, 'probation_end');
  assert.equal(by['e-1'].alert, null);
});

check('the filters show active staff by default and each one counts what it shows', () => {
  const rows = directory();
  const counts = P.filterCounts(rows);
  assert.deepEqual(counts, { all: 4, on_leave: 1, advance: 1, pending: 2, due: 1, inactive: 1 });
  assert.deepEqual(P.filterDirectory(rows, {}).map((r) => r.id).sort(), ['e-0', 'e-1', 'e-2', 'e-3']);
  assert.deepEqual(P.filterDirectory(rows, { filter: 'inactive' }).map((r) => r.id), ['e-4']);
  assert.deepEqual(P.filterDirectory(rows, { filter: 'due' }).map((r) => r.id), ['e-2']);
  assert.deepEqual(P.filterDirectory(rows, { filter: 'on_leave' }).map((r) => r.id), ['e-1']);
});

check('search ignores hamza and the like, matches the title, the department and the phone', () => {
  const rows = directory();
  assert.deepEqual(P.filterDirectory(rows, { query: 'احمد' }).map((r) => r.id), ['e-0']);
  assert.deepEqual(P.filterDirectory(rows, { query: 'حارس' }).map((r) => r.id), ['e-1']);
  assert.deepEqual(P.filterDirectory(rows, { query: 'الصيانة' }).map((r) => r.id), ['e-3']);
  assert.equal(P.filterDirectory(rows, { query: '0911111111' }).length, 4);
  assert.deepEqual(P.filterDirectory(rows, { query: 'لا أحد بهذا الاسم' }), []);
});

check('the department filter and the other filters combine', () => {
  const rows = directory();
  assert.deepEqual(P.filterDirectory(rows, { department: 'الأمن' }).map((r) => r.id).sort(), ['e-0', 'e-1']);
  assert.deepEqual(P.filterDirectory(rows, { department: 'الأمن', filter: 'on_leave' }).map((r) => r.id), ['e-1']);
  assert.deepEqual(P.filterDirectory(rows, { department: 'الأمن', query: 'خالد' }).map((r) => r.id), ['e-1']);
  assert.deepEqual(P.filterDirectory(rows, { department: 'غير موجود' }), []);
});

check('departments are listed once with how many people are in each', () => {
  assert.deepEqual(P.departmentOptions(directory()), [
    { name: 'الأمن', count: 2 },
    { name: 'الصيانة', count: 1 },
    { name: 'المالية', count: 2 },
  ]);
});

check('the totals count active staff only', () => {
  const s = P.directoryStats(directory());
  assert.equal(s.headcount, 4);
  assert.equal(s.inactive, 1);
  assert.equal(s.monthlyPayroll, 2250 + 1400 + 2650 + 1800);
  assert.equal(s.onLeave, 1);
  assert.equal(s.advanceHolders, 1);
  assert.equal(s.advanceBalance, 1000);
  assert.equal(s.dueNow, 750);
});

check('an empty directory has zero totals and no departments', () => {
  const rows = P.buildDirectoryRows({ contacts: [], today: TODAY });
  assert.deepEqual(rows, []);
  assert.deepEqual(P.directoryStats(rows), { headcount: 0, inactive: 0, monthlyPayroll: 0, onLeave: 0, advanceHolders: 0, advanceBalance: 0, dueNow: 0 });
  assert.deepEqual(P.departmentOptions(rows), []);
  assert.deepEqual(P.filterCounts(rows), { all: 0, on_leave: 0, advance: 0, pending: 0, due: 0, inactive: 0 });
});

check('a contact with no salary, no phone and nothing else still makes a row', () => {
  const rows = P.buildDirectoryRows({ contacts: [{ id: 'x', name: 'بلا بيانات', phone: null, job_title: null, department: null, hire_date: null, salary: null, is_active: true }], today: TODAY });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].salary, 0);
  assert.equal(rows[0].dueNow, 0);
  assert.equal(rows[0].alert, null);
  assert.equal(rows[0].status.key, 'working');
});

check('an employee whose service ended is listed with the inactive ones, not the working ones', () => {
  const rows = P.buildDirectoryRows({
    contacts: [contact('e-0', 'منتهي الخدمة')],
    details: [detailsOf('e-0', { termination_date: '2026-09-30', termination_reason: 'استقالة' })],
    today: TODAY,
  });
  assert.equal(rows[0].status.key, 'ended');
  assert.equal(P.filterDirectory(rows, {}).length, 0);
  assert.equal(P.filterDirectory(rows, { filter: 'inactive' }).length, 1);
  assert.equal(P.directoryStats(rows).headcount, 0);
});

console.log(`\n${passed} checks passed`);
