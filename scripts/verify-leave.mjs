/**
 * Employee leave rules with no database: working days (Friday and Saturday off), overlap, the annual balance
 * with carry-over and the year boundary, unpaid-leave suggestion, who may do what, labels, and reading rows.
 *   npx tsx scripts/verify-leave.mjs
 * The same numbers are checked against the database in scripts/test-leave-scenarios.mjs.
 */
import assert from 'node:assert/strict';

const L = await import('../src/lib/leave.ts');
const { addDaysISO } = await import('../src/lib/mall-dates.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

// 2026-10-18 is a Sunday: 18 Sun, 19 Mon, 20 Tue, 21 Wed, 22 Thu, 23 Fri, 24 Sat.
const SUN = '2026-10-18';
const THU = '2026-10-22';
const FRI = '2026-10-23';
const SAT = '2026-10-24';
const TODAY = '2026-10-19';

const brute = (start, end, weekend = [5, 6]) => {
  let n = 0;
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    const [y, m, day] = d.split('-').map(Number);
    if (!weekend.includes(new Date(Date.UTC(y, m - 1, day)).getUTCDay())) n += 1;
  }
  return n;
};

// ── working days ────────────────────────────────────────────────────────────

check('one working day, a whole working week, and a weekend', () => {
  assert.equal(L.workingDays(SUN, SUN), 1);
  assert.equal(L.workingDays(SUN, THU), 5);
  assert.equal(L.workingDays(SUN, SAT), 5);
  assert.equal(L.workingDays(FRI, SAT), 0);
  assert.equal(L.workingDays(FRI, FRI), 0);
});

check('a range across two weeks skips both weekends', () => {
  assert.equal(L.workingDays(SUN, '2026-10-25'), 6); // Sun..Thu, Sun
  assert.equal(L.workingDays(SUN, '2026-11-01'), 11); // Sun..Thu, Sun..Thu, Sun
  assert.equal(L.workingDays('2026-10-22', '2026-10-26'), 3); // Thu, Sun, Mon
});

check('the year boundary and a leap day', () => {
  assert.equal(L.workingDays('2026-12-28', '2027-01-05'), 7);
  assert.equal(L.workingDays('2028-02-28', '2028-03-01'), 3); // 29 Feb 2028 exists
  assert.equal(L.workingDays('2027-02-28', '2027-03-01'), 2); // 2027: Sun 28 Feb, Mon 1 Mar
});

check('backwards, empty and unreadable ranges count zero', () => {
  assert.equal(L.workingDays(THU, SUN), 0);
  assert.equal(L.workingDays('', SUN), 0);
  assert.equal(L.workingDays(SUN, 'nope'), 0);
  assert.equal(L.workingDays('2026-13-45', '2026-13-46'), 0);
});

check('the weekend can be changed, and an empty weekend counts every day', () => {
  assert.equal(L.workingDays(SUN, SAT, [6]), 6);
  assert.equal(L.workingDays(SUN, SAT, [0, 6]), 5); // Sunday and Saturday off: Mon..Fri
  assert.equal(L.workingDays(SUN, SAT, []), 7);
  assert.equal(L.workingDays(SUN, SAT, [9, -1, 1.5]), 7); // not week days: ignored
});

check('the count equals a day-by-day count for every range in a 90-day window over a year end', () => {
  const start0 = '2026-11-20';
  for (let a = 0; a < 90; a += 1) {
    for (let b = a; b < 90; b += 3) {
      const s = addDaysISO(start0, a);
      const e = addDaysISO(start0, b);
      assert.equal(L.workingDays(s, e), brute(s, e), `${s}..${e}`);
    }
  }
});

check('a ten-year range is counted without looping day by day', () => {
  assert.equal(L.workingDays('2020-01-01', '2029-12-31'), brute('2020-01-01', '2029-12-31'));
});

check('weekdays and the day someone returns', () => {
  assert.equal(L.weekdayOf(SUN), 0);
  assert.equal(L.weekdayOf(SAT), 6);
  assert.equal(L.weekdayOf('x'), -1);
  assert.equal(L.weekdayLabel(FRI), 'الجمعة');
  assert.equal(L.isWeekend(FRI), true);
  assert.equal(L.isWeekend(THU), false);
  assert.equal(L.nextWorkingDay(THU), '2026-10-25'); // Sunday
  assert.equal(L.nextWorkingDay(FRI), '2026-10-25');
  assert.equal(L.nextWorkingDay(SUN), '2026-10-19');
  assert.equal(L.nextWorkingDay('x'), 'x');
  assert.equal(L.formatReturnDay('2026-10-25'), 'الأحد 25 أكتوبر 2026');
});

check('"5 days from this date" gives an end that is a working day and counts back to 5', () => {
  for (let offset = 0; offset < 7; offset += 1) {
    const start = addDaysISO(SUN, offset);
    for (const days of [1, 2, 5, 6, 10, 23, 30]) {
      const end = L.leaveEndForDays(start, days);
      assert.ok(end, `${start} + ${days}`);
      assert.equal(L.isWeekend(end), false);
      assert.equal(L.workingDays(start, end), days, `${start} + ${days} = ${end}`);
    }
  }
  assert.equal(L.leaveEndForDays(SUN, 5), THU);
  assert.equal(L.leaveEndForDays(FRI, 1), '2026-10-25'); // starting on a weekend day, the first working day is Sunday
});

check('"N days" refuses nonsense', () => {
  assert.equal(L.leaveEndForDays(SUN, 0), null);
  assert.equal(L.leaveEndForDays(SUN, -2), null);
  assert.equal(L.leaveEndForDays(SUN, 2.5), null);
  assert.equal(L.leaveEndForDays('x', 3), null);
  assert.equal(L.leaveEndForDays(SUN, 3, [0, 1, 2, 3, 4, 5, 6]), null);
});

check('working days split by calendar month (payroll is monthly)', () => {
  assert.deepEqual(L.workingDaysByMonth('2026-10-28', '2026-11-04'), { '2026-10': 2, '2026-11': 4 });
  assert.deepEqual(L.workingDaysByMonth('2026-12-30', '2027-01-04'), { '2026-12': 2, '2027-01': 2 });
  assert.deepEqual(L.workingDaysByMonth(FRI, SAT), {});
  assert.deepEqual(L.workingDaysByMonth(THU, SUN), {});
  const split = L.workingDaysByMonth('2026-09-15', '2026-12-20');
  assert.equal(Object.values(split).reduce((s, n) => s + n, 0), L.workingDays('2026-09-15', '2026-12-20'));
});

// ── years ───────────────────────────────────────────────────────────────────

check('years a leave touches, and its working days inside each', () => {
  assert.deepEqual(L.yearsTouched('2026-12-28', '2027-01-05'), [2026, 2027]);
  assert.deepEqual(L.yearsTouched('2026-03-01', '2026-03-09'), [2026]);
  assert.deepEqual(L.yearsTouched('2027-01-05', '2026-12-28'), []);
  assert.equal(L.workingDaysInYear('2026-12-28', '2027-01-05', 2026), 4);
  assert.equal(L.workingDaysInYear('2026-12-28', '2027-01-05', 2027), 3);
  assert.equal(L.workingDaysInYear('2026-12-28', '2027-01-05', 2025), 0);
  assert.equal(L.workingDaysInYear('2026-12-28', '2027-01-05', 2028), 0);
  assert.equal(L.workingDaysInYear('2026-12-28', '2027-01-05', 2026) + L.workingDaysInYear('2026-12-28', '2027-01-05', 2027), 7);
  assert.deepEqual(L.yearBounds(2026), { start: '2026-01-01', end: '2026-12-31' });
});

// ── overlap ─────────────────────────────────────────────────────────────────

const span = (id, start, end, status = 'APPROVED', emp = 'e1', type = 'ANNUAL') => ({ id, employee_id: emp, leave_type: type, start_date: start, end_date: end, status });

check('ranges that share a day overlap, adjacent days do not', () => {
  assert.equal(L.rangesOverlap('2026-10-01', '2026-10-05', '2026-10-05', '2026-10-09'), true);
  assert.equal(L.rangesOverlap('2026-10-01', '2026-10-05', '2026-10-06', '2026-10-09'), false);
  assert.equal(L.rangesOverlap('2026-10-03', '2026-10-04', '2026-10-01', '2026-10-09'), true);
  assert.equal(L.rangesOverlap('2026-10-10', '2026-10-12', '2026-10-01', '2026-10-09'), false);
});

check('only live leave of the same employee clashes, and the request being edited is skipped', () => {
  const list = [
    span('a', '2026-10-01', '2026-10-05'),
    span('b', '2026-10-12', '2026-10-14', 'PENDING'),
    span('c', '2026-10-20', '2026-10-22', 'CANCELLED'),
    span('d', '2026-10-25', '2026-10-27', 'REJECTED'),
    span('e', '2026-10-01', '2026-10-30', 'APPROVED', 'e2'),
  ];
  const q = (start, end, extra = {}) => L.findOverlap(list, { employeeId: 'e1', start, end, ...extra });
  assert.equal(q('2026-10-05', '2026-10-06')?.id, 'a');
  assert.equal(q('2026-10-13', '2026-10-13')?.id, 'b');
  assert.equal(q('2026-10-20', '2026-10-22'), null);
  assert.equal(q('2026-10-25', '2026-10-27'), null);
  assert.equal(q('2026-10-06', '2026-10-11'), null);
  assert.equal(q('2026-10-01', '2026-10-05', { excludeId: 'a' }), null);
  assert.equal(q('2026-09-28', '2026-10-30')?.id, 'a'); // the earliest of several
});

check('a range is refused with a plain reason, or accepted', () => {
  const base = { start: '2026-11-01', end: '2026-11-05', type: 'ANNUAL', today: TODAY };
  assert.equal(L.validateLeaveRange(base), null);
  assert.match(L.validateLeaveRange({ ...base, start: '' }), /حدّد/);
  assert.match(L.validateLeaveRange({ ...base, end: '2026-10-30' }), /قبل تاريخ بدايتها/);
  assert.match(L.validateLeaveRange({ ...base, end: '2027-12-30' }), /أطول من سنة/);
  assert.match(L.validateLeaveRange({ ...base, start: '2019-12-01', end: '2019-12-03' }), /غير معقول/);
  assert.match(L.validateLeaveRange({ ...base, start: '2029-01-01', end: '2029-01-03' }), /غير معقول/);
  assert.match(L.validateLeaveRange({ ...base, type: 'OTHER', reason: ' ' }), /اكتب سبب/);
  assert.equal(L.validateLeaveRange({ ...base, type: 'OTHER', reason: 'مراجعة جهة حكومية' }), null);
  assert.match(L.validateLeaveRange({ ...base, hireDate: '2026-11-03' }), /قبل تاريخ تعيين/);
  assert.match(L.validateLeaveRange({ ...base, terminationDate: '2026-11-03' }), /بعد تاريخ انتهاء خدمة/);
  assert.match(L.validateLeaveRange({ ...base, start: FRI, end: SAT }), /عطلة أسبوعية/);
});

// ── balance ─────────────────────────────────────────────────────────────────

const inputs = { year: 2026, annualDays: 30, carryOver: 5, carryOverYear: 2026 };
const line = (lines, type) => lines.find((l) => l.type === type);

check('annual entitlement is the allowance plus the carry-over of that year only', () => {
  assert.equal(L.annualEntitlement(inputs), 35);
  assert.equal(L.annualEntitlement({ ...inputs, year: 2027 }), 30);
  assert.equal(L.annualEntitlement({ ...inputs, carryOverYear: null }), 30);
  assert.equal(L.annualEntitlement({ ...inputs, annualDays: 21, carryOver: 0 }), 21);
});

check('taken, pending and remaining; cancelled and rejected leave count for nothing', () => {
  const reqs = [
    span('1', '2026-02-01', '2026-02-05'), // 5 days approved
    span('2', '2026-04-05', '2026-04-09', 'PENDING'), // 5 pending
    span('3', '2026-06-07', '2026-06-11', 'CANCELLED'),
    span('4', '2026-07-05', '2026-07-09', 'REJECTED'),
    span('5', '2026-08-02', '2026-08-04', 'APPROVED', 'e1', 'SICK'), // 3 sick
    span('6', '2026-09-06', '2026-09-07', 'APPROVED', 'e1', 'UNPAID'),
  ];
  const lines = L.computeBalance(reqs, inputs);
  assert.equal(lines.length, 6);
  assert.deepEqual(lines.map((l) => l.type), L.LEAVE_TYPES);
  const annual = line(lines, 'ANNUAL');
  assert.equal(annual.entitlement, 35);
  assert.equal(annual.carryOver, 5);
  assert.equal(annual.taken, 5);
  assert.equal(annual.pending, 5);
  assert.equal(annual.remaining, 25);
  assert.deepEqual([line(lines, 'SICK').taken, line(lines, 'SICK').entitlement, line(lines, 'SICK').remaining], [3, null, null]);
  assert.equal(line(lines, 'UNPAID').taken, 2);
  assert.equal(L.isOverLimit(annual), false);
  assert.ok(Math.abs(L.usedShare(annual) - 10 / 35) < 1e-9);
});

check('a leave across New Year is split between the two years', () => {
  const reqs = [span('x', '2026-12-28', '2027-01-05')];
  const y26 = line(L.computeBalance(reqs, inputs), 'ANNUAL');
  const y27 = line(L.computeBalance(reqs, { ...inputs, year: 2027 }), 'ANNUAL');
  assert.equal(y26.taken, 4);
  assert.equal(y27.taken, 3);
  assert.equal(y27.entitlement, 30); // the 2026 carry-over does not follow into 2027
  assert.equal(y27.carryOver, 0);
  assert.equal(y27.remaining, 27);
});

check('over the limit after an exception, and the share is capped at the whole', () => {
  const reqs = [span('1', '2026-01-04', '2026-02-12')]; // 30 working days
  const lines = L.computeBalance(reqs, { ...inputs, carryOver: 0 });
  assert.equal(line(lines, 'ANNUAL').remaining, 0);
  const more = L.computeBalance([...reqs, span('2', '2026-03-01', '2026-03-03')], { ...inputs, carryOver: 0 });
  assert.equal(line(more, 'ANNUAL').remaining, -3);
  assert.equal(L.isOverLimit(line(more, 'ANNUAL')), true);
  assert.equal(L.usedShare(line(more, 'ANNUAL')), 1);
  assert.equal(L.isOverLimit(null), false);
  assert.equal(L.usedShare(null), 0);
  assert.equal(L.usedShare({ ...line(more, 'SICK') }), 0);
});

check('can an annual leave be requested: enough, short, two years, an approval, an edit', () => {
  const approved = [span('1', '2026-01-04', '2026-02-05')]; // 25 days (Jan 4..Feb 5 = 25 working days)
  const used = L.workingDays('2026-01-04', '2026-02-05');
  const common = { annualDays: 30, carryOver: 0, carryOverYear: null };
  const ok = L.checkAnnualBalance(approved, { ...common, start: '2026-05-03', end: '2026-05-07' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.years.map((y) => [y.year, y.need, y.available, y.short]), [[2026, 5, 30 - used, 0]]);
  const short = L.checkAnnualBalance(approved, { ...common, start: '2026-05-03', end: '2026-05-14' }); // 10 days vs 5 left
  assert.equal(short.ok, false);
  assert.equal(short.years[0].short, 10 - (30 - used));
  // a pending request counts for a new request, and not for an approval
  const withPending = [...approved, span('p', '2026-06-07', '2026-06-11', 'PENDING')];
  assert.equal(L.checkAnnualBalance(withPending, { ...common, start: '2026-07-05', end: '2026-07-09' }).years[0].available, 30 - used - 5);
  assert.equal(L.checkAnnualBalance(withPending, { ...common, countPending: false, start: '2026-07-05', end: '2026-07-09' }).years[0].available, 30 - used);
  // editing a request does not count its own days against itself
  assert.equal(L.checkAnnualBalance(withPending, { ...common, excludeId: 'p', start: '2026-06-07', end: '2026-06-11' }).years[0].available, 30 - used);
  // two years: 2026 has room, 2027 does not
  const across = L.checkAnnualBalance([span('y', '2027-01-04', '2027-02-12')], { ...common, start: '2026-12-28', end: '2027-01-05' });
  assert.equal(across.ok, false);
  assert.deepEqual(across.years.map((y) => [y.year, y.short > 0]), [[2026, false], [2027, true]]);
  // a request that is only weekend needs nothing
  assert.deepEqual(L.checkAnnualBalance([], { ...common, start: FRI, end: SAT }).years, []);
});

check('the carry-over helps only inside its year', () => {
  const full = [span('1', '2026-01-04', '2026-02-12')]; // 30 days used of 30
  const withCarry = { annualDays: 30, carryOver: 4, carryOverYear: 2026 };
  assert.equal(L.checkAnnualBalance(full, { ...withCarry, start: '2026-03-01', end: '2026-03-04' }).ok, true);
  assert.equal(L.checkAnnualBalance(full, { ...withCarry, start: '2026-03-01', end: '2026-03-05' }).ok, false);
  assert.equal(L.checkAnnualBalance([], { ...withCarry, start: '2027-01-04', end: '2027-02-12' }).ok, true); // 30 in 2027
  assert.equal(L.checkAnnualBalance([], { ...withCarry, start: '2027-01-04', end: '2027-02-15' }).ok, false);
});

check('balance rows from the database: text numbers, gaps and strangers', () => {
  const lines = L.parseBalanceRows([
    { leave_type: 'ANNUAL', entitlement: '35.0', carry_over: '5.0', taken: '12', pending: 3, remaining: '20.0' },
    { leave_type: 'SICK', entitlement: null, carry_over: null, taken: 2, pending: 0, remaining: null },
    { leave_type: 'VACATION', taken: 9 },
    null,
  ]);
  assert.equal(lines.length, 6);
  assert.deepEqual(lines[0], { type: 'ANNUAL', entitlement: 35, carryOver: 5, taken: 12, pending: 3, remaining: 20 });
  assert.deepEqual(lines[1], { type: 'SICK', entitlement: null, carryOver: 0, taken: 2, pending: 0, remaining: null });
  assert.deepEqual(lines[2], { type: 'UNPAID', entitlement: null, carryOver: 0, taken: 0, pending: 0, remaining: null });
  assert.equal(L.annualLine(lines).type, 'ANNUAL');
  // no usable answer is an empty list, never six lines of zeros
  assert.deepEqual(L.parseBalanceRows('boom'), []);
  assert.deepEqual(L.parseBalanceRows(undefined), []);
  assert.deepEqual(L.parseBalanceRows([]), []);
  assert.deepEqual(L.parseBalanceRows([{ leave_type: 'VACATION', taken: 9 }]), []);
});

// ── words ───────────────────────────────────────────────────────────────────

check('days agree with their number', () => {
  assert.equal(L.daysLabel(1), 'يوم');
  assert.equal(L.daysLabel(2), 'يومين');
  assert.equal(L.daysLabel(3), '3 أيام');
  assert.equal(L.daysLabel(10), '10 أيام');
  assert.equal(L.daysLabel(11), '11 يوماً');
  assert.equal(L.daysLabel(0), '0 يوم');
  assert.equal(L.daysLabel(2.5), '2.5 يوماً');
  assert.equal(L.workingDaysLabel(1), 'يوم عمل');
  assert.equal(L.workingDaysLabel(2), 'يومي عمل');
  assert.equal(L.workingDaysLabel(5), '5 أيام عمل');
  assert.equal(L.workingDaysLabel(12), '12 يوم عمل');
  assert.equal(L.workingDaysLabel(0), '0 يوم عمل');
});

check('a date range reads short inside a month and in full across months and years', () => {
  assert.equal(L.formatLeaveRange('2026-10-12', '2026-10-16'), '12 – 16 أكتوبر 2026');
  assert.equal(L.formatLeaveRange('2026-10-12', '2026-10-12'), '12 أكتوبر 2026');
  assert.equal(L.formatLeaveRange('2026-09-30', '2026-10-02'), '30 سبتمبر – 02 أكتوبر 2026');
  assert.equal(L.formatLeaveRange('2026-12-30', '2027-01-03'), '30 ديسمبر 2026 – 03 يناير 2027');
  assert.equal(L.formatLeaveRange('', ''), '—');
  assert.equal(L.leaveSummaryLine({ leave_type: 'SICK', days: 2, start_date: '2026-10-12', end_date: '2026-10-13' }), 'مرضية · يومي عمل · 12 – 13 أكتوبر 2026');
});

check('types and statuses have labels, tones and accents; a stranger is "other"', () => {
  assert.equal(L.leaveTypeLabel('ANNUAL'), 'سنوية');
  assert.equal(L.leaveTypeLabel('ANNUAL', true), 'إجازة سنوية');
  assert.equal(L.leaveTypeLabel('UNPAID'), 'بدون راتب');
  assert.equal(L.leaveTypeLabel('weird'), 'أخرى');
  assert.equal(L.leaveTypeLabel(null), 'أخرى');
  assert.equal(L.leaveStatusLabel('PENDING'), 'بانتظار القرار');
  assert.equal(L.leaveStatusLabel('x'), '—');
  assert.deepEqual(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'x'].map(L.leaveStatusTone), ['warning', 'success', 'danger', 'neutral', 'neutral']);
  const accents = L.LEAVE_TYPES.map(L.leaveTypeAccent);
  assert.equal(new Set(accents).size, 6);
  assert.equal(L.leaveTypeAccent('x'), 'violet');
  assert.equal(L.employmentTypeLabel('PART_TIME'), 'دوام جزئي');
  assert.equal(L.employmentTypeLabel('x'), '—');
  assert.ok(L.isLeaveType('SICK') && !L.isLeaveType('sick') && !L.isLeaveStatus(1) && L.isEmploymentType('CONTRACT'));
});

check('the balance card says what is left, what is taken, and when it is exceeded', () => {
  const d = (patch) => L.describeBalance({ type: 'ANNUAL', entitlement: 30, carryOver: 0, taken: 14, pending: 4, remaining: 12, ...patch });
  assert.deepEqual(d({}), { headline: 'المتبقي 12 يوماً', detail: 'المستحق 30 · المعتمد 14 · بانتظار القرار 4', over: false });
  assert.equal(d({ pending: 0, remaining: 16 }).detail, 'المستحق 30 · المعتمد 14');
  assert.equal(d({ taken: 30, pending: 0, remaining: 0 }).headline, 'لا رصيد متبقٍّ');
  assert.deepEqual([d({ taken: 33, pending: 0, remaining: -3 }).headline, d({ taken: 33, pending: 0, remaining: -3 }).over], ['تجاوز بمقدار 3 أيام', true]);
  assert.equal(d({ remaining: 1 }).headline, 'المتبقي يوم');
  assert.equal(L.describeBalance(null).headline, 'لا يوجد رصيد');
  assert.equal(L.describeBalance({ type: 'SICK', entitlement: null, carryOver: 0, taken: 2, pending: 0, remaining: null }).headline, 'لا يوجد رصيد');
});

check('an approved leave is upcoming, ongoing or past', () => {
  const r = (s, e) => ({ start_date: s, end_date: e });
  assert.equal(L.leavePhase(r('2026-10-25', '2026-10-29'), TODAY), 'upcoming');
  assert.equal(L.leavePhase(r('2026-10-19', '2026-10-21'), TODAY), 'ongoing');
  assert.equal(L.leavePhase(r('2026-10-15', '2026-10-19'), TODAY), 'ongoing');
  assert.equal(L.leavePhase(r('2026-10-12', '2026-10-18'), TODAY), 'past');
  assert.deepEqual(['ongoing', 'upcoming', 'past'].map(L.leavePhaseLabel), ['جارية', 'قادمة', 'منتهية']);
});

// ── who may do what ─────────────────────────────────────────────────────────

check('roles: manage is owner, admin, accountant; approve is owner and admin; cashiers see who is away', () => {
  const p = (role) => L.leavePowers(role);
  assert.deepEqual(p('owner'), { canManage: true, canApprove: true, canSeeOnLeave: true });
  assert.deepEqual(p('admin'), { canManage: true, canApprove: true, canSeeOnLeave: true });
  assert.deepEqual(p('accountant'), { canManage: true, canApprove: false, canSeeOnLeave: true });
  assert.deepEqual(p('cashier'), { canManage: false, canApprove: false, canSeeOnLeave: true });
  assert.deepEqual(p('member'), { canManage: false, canApprove: false, canSeeOnLeave: true });
  assert.deepEqual(p('viewer'), { canManage: false, canApprove: false, canSeeOnLeave: false });
  assert.deepEqual(p(null), { canManage: false, canApprove: false, canSeeOnLeave: false });
  assert.deepEqual(p(' Owner '), { canManage: true, canApprove: true, canSeeOnLeave: true });
});

check('row buttons: decide, withdraw, cancel before the start, end early once started', () => {
  const owner = L.leavePowers('owner');
  const acct = L.leavePowers('accountant');
  const viewer = L.leavePowers('viewer');
  const row = (status, s, e) => ({ status, start_date: s, end_date: e });
  const pending = row('PENDING', '2026-10-25', '2026-10-29');
  assert.deepEqual(L.leaveActions(pending, owner, TODAY), { decide: true, cancel: true, endEarly: false });
  assert.deepEqual(L.leaveActions(pending, acct, TODAY), { decide: false, cancel: true, endEarly: false });
  assert.deepEqual(L.leaveActions(pending, viewer, TODAY), { decide: false, cancel: false, endEarly: false });
  const upcoming = row('APPROVED', '2026-10-25', '2026-10-29');
  assert.deepEqual(L.leaveActions(upcoming, owner, TODAY), { decide: false, cancel: true, endEarly: false });
  assert.deepEqual(L.leaveActions(upcoming, acct, TODAY), { decide: false, cancel: false, endEarly: false });
  const startsToday = row('APPROVED', TODAY, '2026-10-22');
  assert.deepEqual(L.leaveActions(startsToday, owner, TODAY), { decide: false, cancel: true, endEarly: true });
  const ongoing = row('APPROVED', '2026-10-15', '2026-10-22');
  assert.deepEqual(L.leaveActions(ongoing, owner, TODAY), { decide: false, cancel: false, endEarly: true });
  assert.deepEqual(L.leaveActions(ongoing, acct, TODAY), { decide: false, cancel: false, endEarly: false });
  const lastDay = row('APPROVED', '2026-10-15', TODAY);
  assert.equal(L.leaveActions(lastDay, owner, TODAY).endEarly, false); // nothing left to cut
  const past = row('APPROVED', '2026-10-01', '2026-10-05');
  assert.deepEqual(L.leaveActions(past, owner, TODAY), { decide: false, cancel: false, endEarly: false });
  for (const status of ['REJECTED', 'CANCELLED']) {
    assert.deepEqual(L.leaveActions(row(status, '2026-10-25', '2026-10-29'), owner, TODAY), { decide: false, cancel: false, endEarly: false });
  }
});

// ── unpaid leave and pay ────────────────────────────────────────────────────

check('unpaid leave suggests pay / 30 per day, rounded, and never more than a month', () => {
  assert.equal(L.suggestedUnpaidDeduction(2250, 5), 375);
  assert.equal(L.suggestedUnpaidDeduction(1400, 3), 140);
  assert.equal(L.suggestedUnpaidDeduction(1000, 1), 33.333);
  assert.equal(L.suggestedUnpaidDeduction(1000, 2), 66.667);
  assert.equal(L.suggestedUnpaidDeduction(1800, 45), 1800);
  assert.equal(L.suggestedUnpaidDeduction(1800, 30), 1800);
  assert.equal(L.suggestedUnpaidDeduction(0, 5), 0);
  assert.equal(L.suggestedUnpaidDeduction(-100, 5), 0);
  assert.equal(L.suggestedUnpaidDeduction(1000, 0), 0);
  assert.equal(L.suggestedUnpaidDeduction(Number.NaN, 3), 0);
  assert.equal(L.suggestedUnpaidDeduction(1000, Infinity), 0);
  assert.equal(L.unpaidDayRate(2250), 75);
  assert.equal(L.unpaidDayRate(1400), 46.667);
  assert.equal(L.unpaidDayRate(0), 0);
  assert.equal(L.unpaidDayRate(Number.NaN), 0);
});

check('a leave over two months suggests one deduction per payroll month, rest days between the working days included', () => {
  // Wed 28 Oct .. Wed 4 Nov: 8 days in a row away, 6 of them working days; Friday and Saturday inside are not paid either
  assert.deepEqual(L.suggestedUnpaidDeductionsByMonth(3000, '2026-10-28', '2026-11-04'), [
    { month: '2026-10', days: 4, total: 400 },
    { month: '2026-11', days: 4, total: 400 },
  ]);
  assert.deepEqual(L.suggestedUnpaidDeductionsByMonth(3000, FRI, SAT), []);
  // Thu 22 .. Sun 25 Oct: Friday and Saturday between a Thursday and a Sunday are part of the time away
  assert.deepEqual(L.suggestedUnpaidDeductionsByMonth(3000, THU, '2026-10-25'), [{ month: '2026-10', days: 4, total: 400 }]);
});

check('unpaid days: a week is its working days, a rest day at either end is not counted, a whole month is the whole pay', () => {
  const days = (a, b) => L.unpaidDaysByMonth(a, b);
  assert.deepEqual(days(SUN, THU), { '2026-10': 5 });
  assert.deepEqual(days(SUN, SAT), { '2026-10': 5 }); // the Friday and Saturday after the last working day are not leave
  assert.deepEqual(days(FRI, '2026-10-25'), { '2026-10': 1 }); // starts on a rest day: only Sunday
  assert.deepEqual(days('2026-10-22', '2026-10-25'), { '2026-10': 4 }); // Thu, Fri, Sat, Sun
  assert.deepEqual(days('2026-10-22', '2026-10-24'), { '2026-10': 1 }); // Thu then the weekend: one day
  assert.deepEqual(days(FRI, SAT), {});
  assert.deepEqual(days(THU, SUN), {}); // Sunday 18 is before Thursday 22: backwards
  assert.deepEqual(days('2026-10-01', '2026-10-31'), { '2026-10': 30 }); // 31 days, the whole month
  assert.deepEqual(days('2027-02-01', '2027-02-28'), { '2027-02': 30 }); // 28 days, still the whole month
  assert.deepEqual(days('2026-11-01', '2026-11-30'), { '2026-11': 30 });
  assert.deepEqual(days('2026-09-20', '2026-11-10'), { '2026-09': 11, '2026-10': 30, '2026-11': 10 }); // a month in the middle is whole
  assert.deepEqual(days('2026-12-27', '2027-01-06'), { '2026-12': 5, '2027-01': 6 });
  assert.deepEqual(days('2026-10-22', '2026-10-01'), {}); // backwards
  assert.deepEqual(days('', SUN), {});
  assert.deepEqual(days(SUN, 'x'), {});
  assert.deepEqual(days('2026-02-30', '2026-03-02'), {});
  // never more than a month's pay for one month
  for (const [a, b] of [['2026-10-01', '2026-10-31'], ['2026-09-01', '2026-12-31'], ['2026-10-02', '2026-10-30']]) {
    for (const row of L.suggestedUnpaidDeductionsByMonth(1800, a, b)) assert.ok(row.total <= 1800 && row.days <= 30, `${a}..${b} ${JSON.stringify(row)}`);
  }
  assert.deepEqual(L.suggestedUnpaidDeductionsByMonth(1800, '2026-10-01', '2026-10-31'), [{ month: '2026-10', days: 30, total: 1800 }]);
  assert.deepEqual(L.suggestedUnpaidDeductionsByMonth(0, SUN, THU), [{ month: '2026-10', days: 5, total: 0 }]);
});

// ── the employee file ───────────────────────────────────────────────────────

check('IBAN: spaces and case do not matter; the shape is checked; the tail can be masked', () => {
  assert.equal(L.normalizeIban(' ly83 0020 0000 0000 1234 5678 9 '), 'LY83002000000000123456789');
  assert.equal(L.isValidIban('ly83 0020 0000 0000 1234 5678 9'), true);
  assert.equal(L.isValidIban('LY83'), false);
  assert.equal(L.isValidIban('8300200000000012345678'), false);
  assert.equal(L.isValidIban(''), false);
  assert.equal(L.isValidIban(null), false);
  assert.equal(L.formatIban('ly8300200000000012345678'), 'LY83 0020 0000 0000 1234 5678');
  assert.equal(L.maskTail('0012 3456 4821'), '•••• 4821');
  assert.equal(L.maskTail('4821'), '4821');
  assert.equal(L.maskTail(''), '');
  assert.equal(L.maskTail(null), '');
});

check('time in service reads in years and months', () => {
  assert.equal(L.tenureLabel('2024-03-01', '2026-10-19'), 'سنتان و7 أشهر');
  assert.equal(L.tenureLabel('2024-03-20', '2026-10-19'), 'سنتان و6 أشهر');
  assert.equal(L.tenureLabel('2025-10-19', '2026-10-19'), 'سنة');
  assert.equal(L.tenureLabel('2026-05-01', '2026-10-19'), '5 أشهر');
  assert.equal(L.tenureLabel('2026-10-01', '2026-10-19'), 'أقل من شهر');
  assert.equal(L.tenureLabel('2015-01-01', '2026-10-19'), '11 سنة و9 أشهر');
  assert.equal(L.tenureLabel('2027-01-01', '2026-10-19'), null);
  assert.equal(L.tenureLabel(null, '2026-10-19'), null);
  assert.equal(L.tenureLabel('x', '2026-10-19'), null);
});

check('dates on the file that need a look', () => {
  const none = { contract_end: null, probation_end: null, termination_date: null };
  assert.deepEqual(L.fileAlerts(none, TODAY), []);
  assert.deepEqual(L.fileAlerts(null, TODAY), []);
  const contract = L.fileAlerts({ ...none, contract_end: '2026-11-10' }, TODAY);
  assert.equal(contract.length, 1);
  assert.deepEqual([contract[0].key, contract[0].daysLeft, contract[0].tone, contract[0].label], ['contract_end', 22, 'warning', 'ينتهي العقد بعد 22 يوماً']);
  assert.equal(L.fileAlerts({ ...none, contract_end: '2027-06-01' }, TODAY).length, 0); // far away: nothing to say
  assert.equal(L.fileAlerts({ ...none, contract_end: '2026-12-10' }, TODAY)[0].tone, 'info'); // 52 days
  const expired = L.fileAlerts({ ...none, contract_end: '2026-10-09' }, TODAY)[0];
  assert.deepEqual([expired.tone, expired.label], ['danger', 'انتهى العقد منذ 10 أيام']);
  assert.equal(L.fileAlerts({ ...none, contract_end: TODAY }, TODAY)[0].label, 'ينتهي العقد اليوم');
  const probation = L.fileAlerts({ ...none, probation_end: '2026-10-24' }, TODAY)[0];
  assert.deepEqual([probation.key, probation.tone, probation.label], ['probation_end', 'warning', 'تنتهي فترة التجربة بعد 5 أيام']);
  assert.equal(L.fileAlerts({ ...none, probation_end: '2026-09-01' }, TODAY).length, 0); // over and done
  assert.equal(L.fileAlerts({ ...none, probation_end: '2027-02-01' }, TODAY).length, 0);
  const both = L.fileAlerts({ ...none, contract_end: '2026-11-10', probation_end: '2026-10-30' }, TODAY);
  assert.deepEqual(both.map((a) => a.key), ['contract_end', 'probation_end']);
  // once service is ending, that is the only thing worth saying
  const ending = L.fileAlerts({ contract_end: '2026-11-10', probation_end: '2026-10-30', termination_date: '2026-12-31' }, TODAY);
  assert.deepEqual(ending.map((a) => a.key), ['termination']);
  assert.equal(ending[0].label, 'تنتهي الخدمة بعد 73 يوماً');
  assert.equal(L.fileAlerts({ ...none, termination_date: '2026-09-30' }, TODAY)[0].label, 'انتهت الخدمة');
  assert.equal(L.fileAlerts({ ...none, termination_date: TODAY }, TODAY)[0].label, 'آخر يوم في الخدمة اليوم');
  assert.equal(L.fileAlerts({ ...none, termination_date: '2026-09-30' }, TODAY)[0].tone, 'danger');
});

check('a save starts from the stored file so changing one thing clears nothing else', () => {
  const stored = L.normalizeDetails({
    employee_id: 'e1', national_id: '119900112233', birth_date: '1990-05-17', employment_type: 'CONTRACT', contract_end: '2027-03-01', probation_end: null,
    bank_name: 'مصرف الواحة', bank_account: '0012', iban: 'LY8300200000000012345678', emergency_name: 'عمر', emergency_phone: '0912222222',
    annual_leave_days: 24, leave_carry_over: 3.5, leave_carry_over_year: 2026, termination_date: null, termination_reason: null, notes: 'ملاحظة',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
  });
  const input = L.fileInputFromDetails(stored);
  assert.deepEqual(input, {
    employmentType: 'CONTRACT', nationalId: '119900112233', birthDate: '1990-05-17', contractEnd: '2027-03-01', probationEnd: null,
    bankName: 'مصرف الواحة', bankAccount: '0012', iban: 'LY8300200000000012345678', emergencyName: 'عمر', emergencyPhone: '0912222222',
    annualLeaveDays: 24, leaveCarryOver: 3.5, leaveCarryOverYear: 2026, terminationDate: null, terminationReason: null, notes: 'ملاحظة',
  });
  // every field the form can edit is in it: a field added to the file but not here would be cleared by the next save
  const fields = Object.keys(stored).filter((k) => !['employee_id', 'created_at', 'updated_at'].includes(k));
  assert.equal(Object.keys(input).length, fields.length);
  assert.deepEqual(L.fileInputFromDetails(null), {});
  assert.deepEqual(L.fileInputFromDetails(undefined), {});
});

// ── rows from the database ──────────────────────────────────────────────────

check('a file row: numbers as numbers, blanks as null, a stranger type as full time', () => {
  const d = L.normalizeDetails({
    employee_id: 'e1', national_id: '119900112233', birth_date: '1990-05-17', employment_type: 'CONTRACT', contract_end: '2027-03-01T00:00:00',
    probation_end: null, bank_name: '', bank_account: '0012', iban: 'LY8300200000000012345678', emergency_name: 'عمر', emergency_phone: '0912222222',
    annual_leave_days: '24.0', leave_carry_over: '3.5', leave_carry_over_year: 2026, termination_date: null, termination_reason: null, notes: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
  });
  assert.equal(d.annual_leave_days, 24);
  assert.equal(d.leave_carry_over, 3.5);
  assert.equal(d.contract_end, '2027-03-01');
  assert.equal(d.bank_name, null);
  assert.equal(d.employment_type, 'CONTRACT');
  const bare = L.normalizeDetails({ employee_id: 'e2', employment_type: 'HOBBY' });
  assert.equal(bare.employment_type, 'FULL_TIME');
  assert.equal(bare.annual_leave_days, 30);
  assert.equal(bare.leave_carry_over_year, null);
  assert.equal(L.normalizeDetails(null), null);
  assert.equal(L.normalizeDetails({}), null);
});

check('a request row: known type and status, days as a number, the employee when joined; a bad row is dropped', () => {
  const r = L.normalizeRequest({
    id: 'r1', employee_id: 'e1', leave_type: 'ANNUAL', start_date: '2026-10-12', end_date: '2026-10-16', days: '5.0', status: 'APPROVED',
    reason: null, decision_note: 'موافق', decided_at: '2026-10-01T09:00:00Z', created_at: '2026-09-30T09:00:00Z',
    employee: { id: 'e1', name: 'أحمد سالم', job_title: 'مشرف أمن', department: null },
  });
  assert.equal(r.days, 5);
  assert.equal(r.employee.name, 'أحمد سالم');
  assert.equal(r.employee.department, null);
  assert.equal(r.decision_note, 'موافق');
  assert.equal(r.override_note, null);
  assert.equal(L.normalizeRequest({ id: 'r', employee_id: 'e', leave_type: 'VACATION', start_date: '2026-10-12', end_date: '2026-10-13', status: 'PENDING' }), null);
  assert.equal(L.normalizeRequest({ id: 'r', employee_id: 'e', leave_type: 'SICK', start_date: 'soon', end_date: '2026-10-13', status: 'PENDING' }), null);
  assert.equal(L.normalizeRequest({ id: 'r', employee_id: 'e', leave_type: 'SICK', start_date: '2026-10-12', end_date: '2026-10-13', status: 'MAYBE' }), null);
  assert.equal(L.normalizeRequest(undefined), null);
  assert.equal(L.normalizeRequest({ id: 'r', employee_id: 'e', leave_type: 'SICK', start_date: '2026-10-12', end_date: '2026-10-13', status: 'PENDING' }).employee, null);
});

check('an on-leave row; the return day is worked out when the server leaves it out', () => {
  const row = L.normalizeOnLeave({
    request_id: 'r1', employee_id: 'e1', employee_name: 'خالد عمر', job_title: 'حارس', department: 'الأمن', leave_type: 'SICK',
    start_date: '2026-10-18', end_date: THU, days: '5.0', return_date: '2026-10-25',
  });
  assert.deepEqual([row.days, row.return_date, row.leave_type], [5, '2026-10-25', 'SICK']);
  const older = L.normalizeOnLeave({ request_id: 'r2', employee_id: 'e2', employee_name: 'س', leave_type: 'ZZZ', start_date: '2026-10-18', end_date: THU, days: 5 });
  assert.equal(older.return_date, '2026-10-25');
  assert.equal(older.leave_type, 'OTHER');
  assert.equal(L.normalizeOnLeave({ request_id: 'r3' }), null);
  assert.equal(L.normalizeOnLeave(null), null);
});

console.log(`\n${passed} checks passed`);
