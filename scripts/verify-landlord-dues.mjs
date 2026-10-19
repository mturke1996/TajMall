/**
 * What the mall owes its landlords. Part one: the older month-by-month rent schedule (which payments count,
 * which months are owed, what a contract's dates do) and the payment text the month engine reads back. Part
 * two: the dues and the profile, both built on the month engine (people/obligation-months.ts): landlords found
 * by the role tag in any list, months before the tracking start settled before the system, estimates for a
 * landlord with no monthly rent, this month and the arrears, the payment to start, the order of urgency, the
 * totals, the dashboard summary, and that the profile and the dues give one answer.
 *   npx tsx scripts/verify-landlord-dues.mjs
 */
import assert from 'node:assert/strict';

const roles = await import('../src/lib/contacts/contact-roles.ts');
const dues = await import('../src/lib/landlord-dues.ts');
const counted = await import('../src/lib/contacts/contact-transactions.ts');
const { buildLandlordRentSchedule, landlordPaymentDescription, landlordPaymentMonthKey } = roles;
const { buildLandlordDue, buildLandlordDues, selectDueLandlords, compareLandlordDues, landlordDuesAttention, landlordDueHeadline, landlordArrearsText, landlordPayLabel, landlordIdleText } = dues;
const { buildLandlordProfile, previewTrackingStart, monthlyRentFromInput, monthlyRentPatch, trackingStartPatch, trackingLineText, trackingPreviewText } = await import('../src/lib/landlord-profile.ts');
const { landlordPaymentFor } = dues;
const { formatMoney } = await import('../src/lib/utils.ts');
const formatMoneyOf = (n) => formatMoney(n, 'LYD');
const om = await import('../src/lib/people/obligation-months.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-19';

const landlord = (over = {}) => ({
  id: 'L1',
  kind: 'VENDOR',
  name: 'الحاج مصطفى',
  shop_number: 'قطعة 14',
  phone: '0910000000',
  monthly_rent: '10000',
  contract_start: null,
  contract_end: null,
  job_title: 'مؤجر للمول',
  notes: '[role:landlord]',
  is_active: true,
  ...over,
});
let seq = 0;
const pay = (amount, date, description, over = {}) => ({
  id: `t${++seq}`,
  contact_id: 'L1',
  kind: 'EXPENSE',
  status: 'POSTED',
  amount: String(amount),
  tx_date: date,
  description,
  ...over,
});
const rentFor = (monthName, year = 2026) => `سداد إيجار شهر ${monthName} ${year}`;
const sched = (contact, txs, year = 2026, today = TODAY) => buildLandlordRentSchedule(contact, txs, year, { today });
const month = (s, n) => s.months[n - 1];

// ---------- the schedule ----------

check('stops at the current month: later months are not owed, so they are not outstanding', () => {
  const s = sched(landlord(), []);
  assert.equal(s.dueMonthsCount, 10);
  assert.equal(s.totalExpected, 100000);
  assert.equal(s.totalOutstanding, 100000);
  assert.equal(s.unpaidMonthsCount, 10);
  for (const n of [11, 12]) {
    assert.equal(month(s, n).due, false);
    assert.equal(month(s, n).status, 'not_due');
    assert.equal(month(s, n).notDueReason, 'future');
    assert.equal(month(s, n).remainingAmount, 0);
    assert.equal(month(s, n).expectedAmount, 0);
  }
  assert.equal(month(s, 10).due, true, 'the current month is owed from its first day');
});

check('POSTED and RECONCILED payments count; drafts and voided ones do not', () => {
  const s = sched(landlord(), [
    pay(10000, '2026-01-05', rentFor('يناير')),
    pay(4000, '2026-02-05', rentFor('فبراير'), { status: 'RECONCILED' }),
    pay(9999, '2026-03-05', rentFor('مارس'), { status: 'DRAFT' }),
    pay(9999, '2026-03-06', rentFor('مارس'), { status: 'VOIDED' }),
    pay(9999, '2026-03-07', rentFor('مارس'), { status: undefined }),
  ]);
  assert.equal(month(s, 1).status, 'paid_full');
  assert.equal(month(s, 2).paidAmount, 4000);
  assert.equal(month(s, 2).status, 'paid_partial');
  assert.equal(month(s, 3).paidAmount, 0);
  assert.equal(month(s, 3).status, 'unpaid');
  assert.equal(s.totalPaid, 14000);
});

check('only expenses to this landlord are payments', () => {
  const s = sched(landlord(), [
    pay(10000, '2026-01-05', rentFor('يناير'), { contact_id: 'L2' }),
    pay(10000, '2026-02-05', rentFor('فبراير'), { kind: 'REVENUE' }),
    pay(10000, '2026-03-05', rentFor('مارس'), { contact_id: undefined, contact: { id: 'L1' } }),
  ]);
  assert.equal(month(s, 1).paidAmount, 0);
  assert.equal(month(s, 2).paidAmount, 0);
  assert.equal(month(s, 3).paidAmount, 10000, 'a joined contact object identifies the landlord too');
});

check('the month in the description wins over the date; with no month named, the date decides', () => {
  const s = sched(landlord(), [
    pay(10000, '2026-10-02', rentFor('سبتمبر')),
    pay(10000, '2026-08-20', 'إيجار'),
    pay(10000, '2026-07-01', null),
    pay(10000, '2026-06-03', 'دفعة 2026-05'),
  ]);
  assert.equal(month(s, 9).paidAmount, 10000);
  assert.equal(month(s, 10).paidAmount, 0);
  assert.equal(month(s, 8).paidAmount, 10000);
  assert.equal(month(s, 7).paidAmount, 10000);
  assert.equal(month(s, 5).paidAmount, 10000);
  assert.equal(month(s, 6).paidAmount, 0);
});

check('a contract that starts mid-year owes nothing before its start month, and the start month is owed', () => {
  const s = sched(landlord({ contract_start: '2026-04-15' }), []);
  for (const n of [1, 2, 3]) {
    assert.equal(month(s, n).due, false);
    assert.equal(month(s, n).notDueReason, 'before_contract');
  }
  assert.equal(month(s, 4).due, true);
  assert.equal(s.dueMonthsCount, 7);
  assert.equal(s.totalOutstanding, 70000);
  assert.equal(s.contractStartMissing, false);
});

check('a contract that ended owes nothing after its end month; what was left unpaid inside it is still owed', () => {
  const s = sched(landlord({ contract_start: '2026-01-01', contract_end: '2026-06-20' }), [pay(10000, '2026-01-04', rentFor('يناير'))]);
  assert.equal(s.dueMonthsCount, 6);
  assert.equal(month(s, 6).due, true);
  assert.equal(month(s, 7).due, false);
  assert.equal(month(s, 7).notDueReason, 'after_contract');
  assert.equal(month(s, 10).notDueReason, 'after_contract', 'after the end it is the contract, not the calendar, that excuses the month');
  assert.equal(s.totalOutstanding, 50000);
});

check('a contract that has not begun owes nothing at all', () => {
  const s = sched(landlord({ contract_start: '2027-01-01' }), []);
  assert.equal(s.dueMonthsCount, 0);
  assert.equal(s.totalExpected, 0);
  assert.equal(s.totalOutstanding, 0);
  assert.ok(s.months.every((m) => m.status === 'not_due' && m.notDueReason === 'before_contract'));
});

check('a contract that ends before it starts is flagged and both dates are ignored', () => {
  const s = sched(landlord({ contract_start: '2026-08-01', contract_end: '2026-03-01' }), []);
  assert.equal(s.contractDatesInvalid, true);
  assert.equal(s.contractStartMissing, false);
  assert.equal(s.dueMonthsCount, 10, 'a debt is not hidden because the dates are wrong');
});

check('no contract start is recorded: counted from January, and said so', () => {
  const s = sched(landlord({ contract_end: '2026-12-31' }), []);
  assert.equal(s.contractStartMissing, true);
  assert.equal(s.dueMonthsCount, 10);
  assert.equal(sched(landlord(), []).contractStartMissing, true);
});

check('a rent paid in advance is shown on its month but does not settle an earlier gap', () => {
  const s = sched(landlord(), [pay(10000, '2026-09-01', rentFor('ديسمبر'))]);
  assert.equal(month(s, 12).paidAmount, 10000);
  assert.equal(month(s, 12).status, 'not_due');
  assert.equal(month(s, 12).remainingAmount, 0);
  assert.equal(s.totalPaid, 10000);
  assert.equal(s.totalOutstanding, 100000);
});

check('a surplus in one month never hides a gap in another', () => {
  const s = sched(landlord(), [pay(25000, '2026-01-04', rentFor('يناير'))]);
  assert.equal(month(s, 1).overpaidAmount, 15000);
  assert.equal(month(s, 1).remainingAmount, 0);
  assert.equal(s.overpaidAmount, 15000);
  assert.equal(s.totalOutstanding, 90000);
});

check('an earlier or later year: all twelve months of a past year are owed, none of a future one', () => {
  assert.equal(sched(landlord(), [], 2025).dueMonthsCount, 12);
  assert.equal(sched(landlord(), [], 2027).dueMonthsCount, 0);
  assert.equal(sched(landlord(), [], 2027).totalOutstanding, 0);
});

check('no monthly rent: nothing is owed; a negative or unreadable rent is no rent', () => {
  for (const monthly_rent of [null, '0', '-5', 'abc']) {
    const s = sched(landlord({ monthly_rent }), []);
    assert.equal(s.dueMonthsCount, 0);
    assert.equal(s.totalOutstanding, 0);
    assert.equal(month(s, 1).notDueReason, 'no_rent');
  }
});

check('amounts are summed exactly: three tenths of a dinar leave no float dust', () => {
  const s = sched(landlord({ monthly_rent: '0.3' }), [pay('0.1', '2026-01-01', rentFor('يناير')), pay('0.1', '2026-01-02', rentFor('يناير')), pay('0.1', '2026-01-03', rentFor('يناير'))]);
  assert.equal(month(s, 1).paidAmount, 0.3);
  assert.equal(month(s, 1).status, 'paid_full');
  assert.equal(month(s, 1).remainingAmount, 0);
  const bad = sched(landlord(), [pay('oops', '2026-01-05', rentFor('يناير')), pay(null, '2026-01-06', rentFor('يناير'))]);
  assert.equal(month(bad, 1).paidAmount, 0, 'an unreadable amount is not money');
});

check('the counts match the months: paid, part-paid and unpaid add up to the due months', () => {
  const s = sched(landlord(), [pay(10000, '2026-01-05', rentFor('يناير')), pay(2500, '2026-02-10', rentFor('فبراير')), pay(10000, '2026-07-01', rentFor('يوليو'))]);
  assert.deepEqual([s.paidMonthsCount, s.partialMonthsCount, s.unpaidMonthsCount], [2, 1, 7]);
  assert.equal(s.paidMonthsCount + s.partialMonthsCount + s.unpaidMonthsCount, s.dueMonthsCount);
  assert.equal(s.totalOutstanding, 100000 - 22500);
});

check('a payment dated in December for January is read by a schedule that includes it', () => {
  const s = sched(landlord(), [pay(10000, '2025-12-28', rentFor('يناير'))]);
  assert.equal(month(s, 1).paidAmount, 10000);
});

check('a month named without a year is the one nearest the payment date', () => {
  const key = (description, tx_date) => landlordPaymentMonthKey({ description, tx_date });
  // last month's rent paid in the first days of the new year belongs to the old year
  assert.equal(key('إيجار ديسمبر', '2026-01-05'), '2025-12');
  assert.equal(key('سداد إيجار شهر 12', '2026-01-05'), '2025-12');
  // a rent paid well ahead belongs to the coming year
  assert.equal(key('إيجار يناير', '2026-11-20'), '2027-01');
  assert.equal(key('إيجار فبراير', '2026-09-02'), '2027-02');
  assert.equal(key('إيجار فبراير', '2026-08-02'), '2026-02', 'exactly half a year either way stays in the year of the payment');
  // the ordinary cases do not move: the month before, the same month, a few months ahead
  assert.equal(key('إيجار فبراير', '2026-03-05'), '2026-02');
  assert.equal(key('إيجار مارس', '2026-03-05'), '2026-03');
  assert.equal(key('إيجار يونيو', '2026-03-05'), '2026-06');
  assert.equal(key('إيجار سبتمبر', '2026-03-05'), '2026-09', 'six months ahead is still an advance');
  assert.equal(key('إيجار أكتوبر', '2026-03-05'), '2025-10', 'seven months ahead reads as a late payment of last year');
  // a year in the text always decides
  assert.equal(key('إيجار ديسمبر 2026', '2026-01-05'), '2026-12');
  assert.equal(key('إيجار يناير 2026', '2026-11-20'), '2026-01');
  assert.equal(key('دفعة 2026-12', '2026-01-05'), '2026-12');
  // no month named: the month of the date, as written
  assert.equal(key('إيجار', '2026-01-31'), '2026-01');
  assert.equal(key(null, '2026-12-31T23:30:00'), '2026-12');
});

check('a December rent paid in January does not settle the next December', () => {
  const s = sched(landlord(), [pay(10000, '2026-01-05', 'إيجار ديسمبر')], 2026, '2026-12-15');
  assert.equal(month(s, 12).paidAmount, 0, 'last December\'s rent is not this December\'s');
  assert.equal(month(s, 12).status, 'unpaid');
  const last = sched(landlord(), [pay(10000, '2026-01-05', 'إيجار ديسمبر')], 2025, '2026-12-15');
  assert.equal(month(last, 12).paidAmount, 10000);
});

check('a January rent paid in November does not settle this year\'s January', () => {
  const s = sched(landlord(), [pay(10000, '2026-11-20', 'إيجار يناير')]);
  assert.equal(month(s, 1).paidAmount, 0);
  assert.equal(month(s, 1).status, 'unpaid');
  const next = sched(landlord(), [pay(10000, '2026-11-20', 'إيجار يناير')], 2027);
  assert.equal(month(next, 1).paidAmount, 10000);
  assert.equal(month(next, 1).status, 'not_due');
});

// ---------- the payment text ----------

check('the text a payment is prefilled with is read back as the month it was written for', () => {
  const names = ['الحاج مصطفى السويحلي', 'شركة 2025 للعقارات', 'مؤسسة 7 أكتوبر', 'ورثة محمد نوفمبر', 'شهر 5 للاستثمار', '', '   '];
  for (const name of names) {
    for (let m = 1; m <= 12; m++) {
      const key = `2026-${String(m).padStart(2, '0')}`;
      const text = landlordPaymentDescription(name, key);
      // read it back against a date in another year: only the words can name the month
      assert.equal(landlordPaymentMonthKey({ description: text, tx_date: '1999-06-15' }), key, `${name || '(no name)'} / ${key}: ${text}`);
    }
  }
});

check('the landlord is named in the text unless the name would change the month', () => {
  assert.equal(landlordPaymentDescription('الحاج مصطفى', '2026-03'), 'سداد إيجار شهر مارس 2026 للمؤجر الحاج مصطفى');
  assert.equal(landlordPaymentDescription('مؤسسة 7 أكتوبر', '2026-11'), 'سداد إيجار شهر نوفمبر 2026');
  assert.equal(landlordPaymentDescription('', '2026-03'), 'سداد إيجار شهر مارس 2026');
  assert.equal(landlordPaymentDescription('الحاج', 'oops'), 'سداد إيجار للمؤجر الحاج');
});


// ================= part two: the dues and the profile, on the month engine =================

const mm = (n) => String(n).padStart(2, '0');
const nameOf = (n) => roles.landlordMonthName(n);
/** one named payment for each month from..to of 2026 */
const named = (from, to, amount = 10000, id = 'L1') => Array.from({ length: to - from + 1 }, (_, i) => pay(amount, `2026-${mm(from + i)}-03`, rentFor(nameOf(from + i)), { contact_id: id }));
const keys = (rows) => rows.map((m) => m.monthKey);
const GO_LIVE = '2026-06';
const engineSummary = (contact, payments, goLiveMonth = null) => om.buildObligationYear({ contact, payments, today: TODAY, year: 2026, kind: 'EXPENSE', goLiveMonth }).summary.owed;

// the real picture: a landlord with no rent recorded, rent paid in two parts each month from July, no month in the text
const JULY_AUG = [pay(25000, '2026-07-30', null), pay(27000, '2026-07-31', null), pay(27000, '2026-08-31', null), pay(25000, '2026-08-31', null)];

// ---------- one landlord's dues ----------

check('worked example: no rent recorded, paid July and August in two parts: tracking from July, the rest estimated', () => {
  const d = buildLandlordDue(landlord({ monthly_rent: null }), JULY_AUG, TODAY, { goLiveMonth: GO_LIVE });
  assert.deepEqual(d.tracking, { month: '2026-07', source: 'first_payment' });
  assert.equal(d.status, 'arrears');
  assert.deepEqual(keys(d.arrears.months), ['2026-09']);
  const sep = d.arrears.months[0];
  assert.deepEqual([sep.due, sep.paid, sep.remaining, sep.remainingKnown, sep.estimated], [52000, 0, 52000, true, true]);
  assert.deepEqual([d.due, d.paid, d.remaining], [52000, 0, 52000]);
  assert.equal(d.arrears.amount, 52000);
  assert.equal(d.owed, 104000);
  assert.equal(d.owedMonths, 2);
  assert.equal(d.owedComplete, true);
  assert.equal(d.owedEstimated, true);
  assert.equal(d.monthlyAmount, 52000);
  assert.equal(d.amountSource, 'estimate');
  assert.deepEqual(d.next, { monthKey: '2026-09', monthNameAr: 'سبتمبر', year: 2026, amount: null, estimated: true, late: true, description: 'سداد إيجار شهر سبتمبر 2026 للمؤجر الحاج مصطفى' });
});

check('a landlord filed under customers is read the same way: the kind never decides', () => {
  const asVendor = buildLandlordDue(landlord({ monthly_rent: null }), JULY_AUG, TODAY);
  const asCustomer = buildLandlordDue(landlord({ monthly_rent: null, kind: 'CUSTOMER' }), JULY_AUG, TODAY);
  assert.deepEqual({ ...asCustomer, kind: 'VENDOR' }, asVendor);
  assert.equal(asCustomer.kind, 'CUSTOMER');
});

check('paid in full this month: nothing remains and there is no payment to start', () => {
  const d = buildLandlordDue(landlord(), named(1, 10), TODAY);
  assert.equal(d.status, 'paid');
  assert.deepEqual([d.due, d.paid, d.remaining, d.owed], [10000, 10000, 0, 0]);
  assert.equal(d.arrears.months.length, 0);
  assert.equal(d.next, null);
  assert.equal(d.amountSource, 'monthly_rent');
  assert.equal(landlordDueHeadline(d), 'سُدّد إيجار هذا الشهر');
});

check('nothing paid this month and nothing earlier owed: unpaid, and the payment starts at this month', () => {
  const d = buildLandlordDue(landlord(), named(1, 9), TODAY);
  assert.equal(d.status, 'unpaid');
  assert.equal(d.remaining, 10000);
  assert.equal(d.owed, 10000);
  assert.deepEqual(d.next, { monthKey: '2026-10', monthNameAr: 'أكتوبر', year: 2026, amount: 10000, estimated: false, late: false, description: 'سداد إيجار شهر أكتوبر 2026 للمؤجر الحاج مصطفى' });
  assert.equal(landlordDueHeadline(d), 'لم يُسدَّد إيجار هذا الشهر');
  assert.equal(landlordPayLabel(d.next), 'سداد أكتوبر');
});

check('part of this month paid: partial, with the rest to pay', () => {
  const d = buildLandlordDue(landlord(), [...named(1, 9), pay(3500.25, '2026-10-05', rentFor('أكتوبر'))], TODAY);
  assert.equal(d.status, 'partial');
  assert.deepEqual([d.paid, d.remaining], [3500.25, 6499.75]);
  assert.equal(d.next.amount, 6499.75);
  assert.equal(landlordDueHeadline(d), 'سُدّد جزء من إيجار هذا الشهر');
});

check('earlier months unpaid: arrears, oldest first, and the payment starts at the oldest', () => {
  const paid = [...named(1, 6), ...named(9, 9), pay(4000, '2026-08-01', rentFor('أغسطس'))];
  const d = buildLandlordDue(landlord(), paid, TODAY);
  assert.equal(d.status, 'arrears');
  assert.deepEqual(d.arrears.months.map((m) => [m.monthKey, m.remaining]), [['2026-07', 10000], ['2026-08', 6000]]);
  assert.equal(d.arrears.amount, 16000);
  assert.equal(d.remaining, 10000);
  assert.equal(d.owed, 26000);
  assert.equal(d.owedMonths, 3);
  assert.equal(d.next.monthKey, '2026-07');
  assert.equal(d.next.amount, 10000);
  assert.equal(d.next.late, true);
  assert.equal(d.next.description, 'سداد إيجار شهر يوليو 2026 للمؤجر الحاج مصطفى');
  assert.equal(landlordDueHeadline(d), 'إيجار متأخر: شهران');
  assert.equal(landlordArrearsText(d), 'يوليو وأغسطس');
});

check('months before the first payment were paid before the system: they are never owed', () => {
  // tracking starts at the first payment (July): January to June read as settled, not as nine months of arrears
  const d = buildLandlordDue(landlord(), [pay(10000, '2026-07-03', rentFor('يوليو')), pay(10000, '2026-08-03', rentFor('أغسطس')), pay(10000, '2026-09-03', rentFor('سبتمبر')), pay(10000, '2026-10-03', rentFor('أكتوبر'))], TODAY);
  assert.deepEqual(d.tracking, { month: '2026-07', source: 'first_payment' });
  assert.equal(d.status, 'paid');
  assert.equal(d.owed, 0);
  assert.equal(d.arrears.months.length, 0);
});

check('no payment ever and no tag: tracking starts at the month the system went live', () => {
  const d = buildLandlordDue(landlord(), [], TODAY, { goLiveMonth: GO_LIVE });
  assert.deepEqual(d.tracking, { month: '2026-06', source: 'go_live' });
  assert.deepEqual(keys(d.arrears.months), ['2026-06', '2026-07', '2026-08', '2026-09']);
  assert.equal(d.owedMonths, 5);
  assert.equal(d.owed, 50000);
});

check('the owner\'s tracking start wins over the first payment and the go-live month', () => {
  const d = buildLandlordDue(landlord({ notes: '[role:landlord]\n[since:2026-10]' }), [], TODAY, { goLiveMonth: GO_LIVE });
  assert.deepEqual(d.tracking, { month: '2026-10', source: 'tag' });
  assert.equal(d.status, 'unpaid');
  assert.equal(d.arrears.months.length, 0);
  assert.equal(d.owed, 10000);
  // an earlier month than the first payment is the owner's call: those months now ask for money
  const earlier = buildLandlordDue(landlord({ notes: '[role:landlord]\n[since:2026-01]' }), named(7, 10), TODAY);
  assert.equal(earlier.arrears.months.length, 6);
  assert.equal(earlier.owed, 60000);
});

check('a tracking start after this month: this month was settled before the system, nothing is owed', () => {
  const d = buildLandlordDue(landlord({ notes: '[role:landlord]\n[since:2026-12]' }), [], TODAY);
  assert.equal(d.status, 'none');
  assert.equal(d.idleReason, 'before_system');
  assert.equal(d.owed, 0);
  assert.equal(landlordDueHeadline(d), 'مسدّد قبل المنظومة');
});

check('no payment, no tag, no go-live month: nothing can be judged, so nothing is called owed', () => {
  const d = buildLandlordDue(landlord(), [], TODAY, { goLiveMonth: null });
  assert.equal(d.status, 'none');
  assert.equal(d.idleReason, 'unknown_start');
  assert.deepEqual([d.owed, d.owedMonths], [0, 0]);
  assert.equal(d.next, null);
  assert.equal(landlordDueHeadline(d), 'بداية المتابعة غير محدّدة');
});

check('arrears reach back over the year boundary and agree with the engine\'s own summary', () => {
  const contact = landlord({ monthly_rent: '1000', notes: '[role:landlord]\n[since:2025-11]' });
  const d = buildLandlordDue(contact, [], TODAY);
  assert.deepEqual(keys(d.arrears.months).slice(0, 3), ['2025-11', '2025-12', '2026-01']);
  assert.equal(d.arrears.months.length, 11);
  assert.equal(d.owedMonths, 12);
  assert.equal(d.owed, 12000);
  const s = engineSummary(contact, []);
  assert.deepEqual([s.months, s.amount], [d.owedMonths, d.owed]);
});

check('a messy history: late payments fill the oldest month first, and the dues agree with the engine\'s summary', () => {
  const contact = landlord();
  const history = [...named(1, 6), pay(4000, '2026-08-01', rentFor('أغسطس')), pay(10000, '2026-09-10', null)];
  const d = buildLandlordDue(contact, history, TODAY);
  // the unnamed payment of 10,000 settles July, the oldest gap
  assert.deepEqual(d.arrears.months.map((m) => [m.monthKey, m.remaining]), [['2026-08', 6000], ['2026-09', 10000]]);
  assert.equal(d.owed, 26000);
  assert.equal(d.owedMonths, 3);
  assert.equal(d.next.monthKey, '2026-08');
  assert.equal(d.next.amount, 6000);
  const s = engineSummary(contact, history);
  assert.deepEqual([s.months, s.amount, s.oldest, s.newest], [d.owedMonths, d.owed, '2026-08', '2026-10']);
});

check('arrears while this month is already paid still count as arrears', () => {
  const d = buildLandlordDue(landlord({ notes: '[role:landlord]\n[since:2026-01]' }), [pay(10000, '2026-10-02', rentFor('أكتوبر'))], TODAY);
  assert.equal(d.status, 'arrears');
  assert.equal(d.remaining, 0);
  assert.equal(d.arrears.months.length, 9);
  assert.equal(d.owed, 90000);
  assert.equal(d.next.monthKey, '2026-01');
});

check('contract ended or not begun: no rent this month, and the reason is given', () => {
  const ended = buildLandlordDue(landlord({ contract_start: '2025-01-01', contract_end: '2026-10-05' }), named(1, 10), TODAY);
  assert.equal(ended.status, 'paid', 'the contract still covers October (its end month)');
  const over = buildLandlordDue(landlord({ contract_start: '2025-01-01', contract_end: '2026-09-30' }), named(1, 9), TODAY);
  assert.equal(over.status, 'none');
  assert.equal(over.idleReason, 'after_contract');
  assert.equal(over.owed, 0);
  assert.equal(landlordDueHeadline(over), 'العقد منتهٍ، لا إيجار هذا الشهر');
  const later = buildLandlordDue(landlord({ contract_start: '2026-11-01' }), [], TODAY, { goLiveMonth: GO_LIVE });
  assert.equal(later.status, 'none');
  assert.equal(later.idleReason, 'before_contract');
  assert.equal(landlordDueHeadline(later), 'العقد لم يبدأ، لا إيجار هذا الشهر');
  assert.equal(buildLandlordDue(landlord({ contract_start: '2026-08-01', contract_end: '2026-03-01' }), [], TODAY, { goLiveMonth: GO_LIVE }).contractDatesInvalid, true);
});

check('an ended contract with unpaid months inside it is still owed', () => {
  const d = buildLandlordDue(landlord({ contract_start: '2026-01-01', contract_end: '2026-06-30' }), named(1, 4), TODAY);
  assert.equal(d.status, 'arrears');
  assert.equal(d.arrears.amount, 20000);
  assert.equal(d.remaining, 0);
  assert.equal(d.due, 0);
});

check('a transaction list that includes other people, other kinds and other statuses is read correctly', () => {
  const d = buildLandlordDue(
    landlord({ notes: '[role:landlord]\n[since:2026-10]' }),
    [
      pay(10000, '2025-10-03', rentFor('أكتوبر', 2025)),
      pay(7000, '2026-10-03', rentFor('أكتوبر'), { contact_id: 'someone-else' }),
      pay(5000, '2026-10-03', rentFor('أكتوبر'), { kind: 'REVENUE' }),
      pay(5000, '2026-10-03', rentFor('أكتوبر'), { status: 'DRAFT' }),
      pay(1000, '2026-10-04', rentFor('أكتوبر')),
      pay(500, '2026-10-05', rentFor('أكتوبر'), { status: 'RECONCILED' }),
    ],
    TODAY,
  );
  assert.equal(d.paid, 1500, 'last year\'s October, another party, revenue and drafts are not this October');
  assert.equal(d.status, 'partial');
});

check('a today that is not a date fails loudly instead of giving an answer', () => {
  assert.throws(() => buildLandlordDue(landlord(), [], 'soon'), RangeError);
});

check('the first of the month and the last of the year change the current month, not the logic', () => {
  const tagged = landlord({ notes: '[role:landlord]\n[since:2026-01]' });
  const first = buildLandlordDue(tagged, [], '2026-10-01');
  assert.equal(first.remaining, 10000);
  assert.equal(first.arrears.months.length, 9);
  const jan = buildLandlordDue(tagged, [], '2026-01-01');
  assert.equal(jan.status, 'unpaid');
  assert.equal(jan.arrears.months.length, 0);
  const dec = buildLandlordDue(tagged, [], '2026-12-31');
  assert.equal(dec.arrears.months.length, 11);
  assert.equal(dec.next.monthKey, '2026-01');
});

// ---------- every landlord ----------

const person = (over) => ({ id: 'X', kind: 'VENDOR', name: 'س', notes: null, monthly_rent: null, job_title: null, department: null, is_active: true, created_at: '2026-06-01T14:00:00Z', ...over });

check('landlords are found by the role tag in vendors and customers alike; the rest are not', () => {
  const contacts = [
    person({ id: 'V-tag', kind: 'VENDOR', notes: '[role:landlord]' }),
    person({ id: 'C-tag', kind: 'CUSTOMER', notes: 'عقار\n[ROLE : Landlord]' }),
    person({ id: 'C-plain', kind: 'CUSTOMER' }),
    person({ id: 'C-customer-tag', kind: 'CUSTOMER', notes: '[role:customer]' }),
    person({ id: 'V-rent', kind: 'VENDOR', monthly_rent: '2500' }),
    person({ id: 'V-goods', kind: 'VENDOR' }),
    person({ id: 'V-water', kind: 'VENDOR', notes: '[role:supplier_water]', monthly_rent: '500' }),
    person({ id: 'T-tag', kind: 'TENANT', notes: '[role:landlord]' }),
    person({ id: 'E-tag', kind: 'EMPLOYEE', notes: '[role:landlord]' }),
    person({ id: 'V-off', kind: 'VENDOR', notes: '[role:landlord]', is_active: false }),
    person({ id: 'V-norent', kind: 'VENDOR', notes: '[role:landlord]', monthly_rent: '0' }),
  ];
  assert.deepEqual(selectDueLandlords(contacts).map((c) => c.id), ['V-tag', 'C-tag', 'V-rent', 'V-norent']);
});

check('landlords are ordered by urgency; the order is stable for equal cases; every kind of file takes part', () => {
  const contacts = [
    person({ id: 'paid', name: 'ب مسدد', notes: '[role:landlord]', monthly_rent: '1000' }),
    person({ id: 'partial', name: 'ج جزئي', kind: 'CUSTOMER', notes: '[role:landlord]', monthly_rent: '1000' }),
    person({ id: 'unpaid-big', name: 'د كبير', notes: '[role:landlord]', monthly_rent: '5000' }),
    person({ id: 'unpaid-small', name: 'ه صغير', notes: '[role:landlord]', monthly_rent: '500' }),
    person({ id: 'arrears-new', name: 'و حديث', notes: '[role:landlord]', monthly_rent: '1000' }),
    person({ id: 'arrears-old', name: 'ز قديم', notes: '[role:landlord]', monthly_rent: '1000' }),
    person({ id: 'none', name: 'ح منتهٍ', notes: '[role:landlord]', monthly_rent: '1000', contract_end: '2026-06-30' }),
    person({ id: 'tie-b', name: 'ي ب', notes: '[role:landlord]', monthly_rent: '1000' }),
    person({ id: 'tie-a', name: 'ي أ', notes: '[role:landlord]', monthly_rent: '1000' }),
  ];
  const upTo = (id, last, amount = 1000) => named(1, last, amount, id);
  const tx = [
    ...upTo('paid', 10),
    ...upTo('partial', 9),
    pay(400, '2026-10-02', rentFor('أكتوبر'), { contact_id: 'partial' }),
    ...upTo('unpaid-big', 9, 5000),
    ...upTo('unpaid-small', 9, 500),
    ...upTo('arrears-new', 8),
    pay(1000, '2026-10-01', rentFor('أكتوبر'), { contact_id: 'arrears-new' }),
    ...upTo('arrears-old', 5),
    pay(1000, '2026-10-01', rentFor('أكتوبر'), { contact_id: 'arrears-old' }),
    ...upTo('none', 6),
    ...upTo('tie-b', 9),
    ...upTo('tie-a', 9),
  ];
  const d = buildLandlordDues({ contacts, transactions: tx, today: TODAY });
  assert.deepEqual(d.rows.map((r) => r.contactId), ['arrears-old', 'arrears-new', 'unpaid-big', 'tie-a', 'tie-b', 'unpaid-small', 'partial', 'paid', 'none']);
  assert.deepEqual(d.rows.map((r) => r.status), ['arrears', 'arrears', 'unpaid', 'unpaid', 'unpaid', 'unpaid', 'partial', 'paid', 'none']);
  assert.equal(d.rows.find((r) => r.contactId === 'partial').kind, 'CUSTOMER');
  for (let i = 1; i < d.rows.length; i++) assert.ok(compareLandlordDues(d.rows[i - 1], d.rows[i]) <= 0);
});

// a vendor landlord with a rent, a customer landlord with no rent but payments, a vendor landlord with nothing at all
const mixed = () => {
  const contacts = [
    person({ id: 'A', name: 'أ', notes: '[role:landlord]', monthly_rent: '10000' }),
    person({ id: 'B', name: 'ب', kind: 'CUSTOMER', notes: '[role:landlord]' }),
    person({ id: 'C', name: 'ج', notes: '[role:landlord]' }),
    person({ id: 'D', name: 'د', kind: 'CUSTOMER', notes: '[role:landlord]', monthly_rent: '5000' }),
    person({ id: 'E', name: 'هـ', notes: '[role:landlord]', is_active: false }),
    person({ id: 'F', kind: 'TENANT', notes: '[role:landlord]' }),
    person({ id: 'G', kind: 'CUSTOMER' }),
  ];
  const transactions = [
    ...named(1, 10, 10000, 'A'),
    pay(3000, '2026-07-05', null, { contact_id: 'B' }),
    pay(3000, '2026-08-31', null, { contact_id: 'B' }),
    ...named(1, 9, 5000, 'D'),
  ];
  return { contacts, transactions };
};

check('every landlord is listed with this month\'s position; one with no rent or no payment is not dropped', () => {
  const d = buildLandlordDues({ ...mixed(), today: TODAY });
  assert.equal(d.month, '2026-10');
  assert.equal(d.monthNameAr, 'أكتوبر');
  assert.equal(d.year, 2026);
  // C: nothing recorded at all: tracked from the go-live month, months owed but of an unknown amount; B: Sep and Oct estimated at 3,000
  assert.deepEqual(d.rows.map((r) => [r.contactId, r.status]), [['C', 'arrears'], ['B', 'arrears'], ['D', 'unpaid'], ['A', 'paid']]);
  const c = d.rows[0];
  assert.deepEqual([c.amountSource, c.monthlyAmount, c.owedMonths, c.owed, c.owedComplete], ['unknown', null, 5, 0, false]);
  assert.equal(c.next.amount, null);
  assert.equal(c.next.monthKey, '2026-06');
  const b = d.rows[1];
  assert.deepEqual([b.amountSource, b.monthlyAmount, b.owedMonths, b.owed, b.owedComplete, b.owedEstimated], ['estimate', 3000, 2, 6000, true, true]);
});

check('totals add up the rows: this month, arrears, what is owed overall, how many are estimates', () => {
  const t = buildLandlordDues({ ...mixed(), today: TODAY }).totals;
  assert.deepEqual(t, { landlords: 4, due: 18000, paid: 10000, remaining: 8000, arrears: 3000, owed: 11000, owing: 3, behind: 2, estimated: 2, incomplete: 1 });
  assert.equal(t.owed, t.remaining + t.arrears);
});

check('the go-live month is the earliest file, and can be given', () => {
  const { contacts, transactions } = mixed();
  const late = contacts.map((c) => ({ ...c, created_at: '2026-09-02T10:00:00Z' }));
  // C owes nothing recorded: tracked from September, so June to August are settled before the system
  assert.equal(buildLandlordDues({ contacts: late, transactions, today: TODAY }).rows.find((r) => r.contactId === 'C').owedMonths, 2);
  assert.equal(buildLandlordDues({ contacts, transactions, today: TODAY, goLiveMonth: '2026-10' }).rows.find((r) => r.contactId === 'C').owedMonths, 1);
  assert.equal(buildLandlordDues({ contacts, transactions, today: TODAY, goLiveMonth: null }).rows.find((r) => r.contactId === 'C').status, 'none');
});

check('no landlords: an empty, zeroed result, not an error', () => {
  const d = buildLandlordDues({ contacts: [], transactions: [], today: TODAY });
  assert.deepEqual(d.rows, []);
  assert.deepEqual(d.totals, { landlords: 0, due: 0, paid: 0, remaining: 0, arrears: 0, owed: 0, owing: 0, behind: 0, estimated: 0, incomplete: 0 });
  assert.equal(landlordDuesAttention(d), null);
});

check('the dashboard summary: nothing owed gives none, this month only warns, an earlier month is bad', () => {
  const one = (over, tx) => buildLandlordDues({ contacts: [person({ id: 'L1', notes: '[role:landlord]', monthly_rent: '10000', ...over })], transactions: tx, today: TODAY });
  assert.equal(landlordDuesAttention(one({}, named(1, 10))), null);
  assert.deepEqual(landlordDuesAttention(one({}, named(1, 9))), { count: 1, amount: 10000, amountComplete: true, estimated: false, behind: 0, tone: 'warn', href: '/mall?tab=people&role=LANDLORD' });
  const behind = landlordDuesAttention(one({}, named(1, 6)));
  assert.deepEqual([behind.count, behind.amount, behind.behind, behind.tone], [1, 40000, 1, 'bad']);
  const unknown = landlordDuesAttention(buildLandlordDues({ ...mixed(), today: TODAY }));
  assert.deepEqual([unknown.count, unknown.amount, unknown.amountComplete, unknown.behind, unknown.tone], [3, 11000, false, 2, 'bad']);
});

check('the dashboard summary says when its sum is a guess: only a landlord with no recorded rent makes it one', () => {
  const rented = buildLandlordDues({ contacts: [person({ id: 'L1', notes: '[role:landlord]', monthly_rent: '10000' })], transactions: named(1, 8), today: TODAY });
  assert.equal(landlordDuesAttention(rented).estimated, false, 'a recorded rent makes the amounts exact');
  const guessed = buildLandlordDues({ contacts: [person({ id: 'L1', notes: '[role:landlord]' })], transactions: named(1, 8, 10000), today: TODAY });
  const g = landlordDuesAttention(guessed);
  assert.deepEqual([g.estimated, g.amountComplete, g.amount], [true, true, 20000], 'September and October at the amount of August');
  // nothing paid and no rent: nothing to guess from, so the sum is a floor and not an estimate
  const nothing = landlordDuesAttention(buildLandlordDues({ contacts: [person({ id: 'L1', notes: '[role:landlord]' })], transactions: [], today: TODAY }));
  assert.deepEqual([nothing.estimated, nothing.amountComplete, nothing.amount], [false, false, 0]);
});

check('wording agrees with the count: one, two, three, many; and says why a month carries no rent', () => {
  const rowWith = (n) => ({ arrears: { amount: n, months: Array.from({ length: n }, (_, i) => ({ monthKey: `2026-${mm(i + 1)}`, monthNameAr: roles.landlordMonthName(i + 1), year: 2026, due: 1, paid: 0, remaining: 1, remainingKnown: true, estimated: false })) } });
  assert.equal(landlordArrearsText(rowWith(0)), null);
  assert.equal(landlordArrearsText(rowWith(1)), 'يناير');
  assert.equal(landlordArrearsText(rowWith(2)), 'يناير وفبراير');
  assert.equal(landlordArrearsText(rowWith(3)), 'يناير، فبراير ومارس');
  assert.equal(landlordArrearsText(rowWith(4)), '4 أشهر منذ يناير');
  assert.equal(landlordArrearsText(rowWith(11)), '11 شهراً منذ يناير');
  const headline = (n) => landlordDueHeadline({ status: 'arrears', idleReason: null, ...rowWith(n) });
  assert.equal(headline(1), 'إيجار متأخر: شهر واحد');
  assert.equal(headline(2), 'إيجار متأخر: شهران');
  assert.equal(headline(3), 'إيجار متأخر: 3 أشهر');
  assert.equal(headline(11), 'إيجار متأخر: 11 شهراً');
  assert.equal(landlordIdleText(null), null);
  assert.equal(landlordIdleText('before_system'), 'مسدّد قبل المنظومة');
});

// ---------- the profile ----------

const profileOf = (contact, payments, over = {}) => buildLandlordProfile({ contact, payments, today: TODAY, goLiveMonth: GO_LIVE, ...over });

check('profile, worked example: the grid, the figures and the payments agree with the dues', () => {
  const contact = landlord({ monthly_rent: null });
  const p = profileOf(contact, JULY_AUG);
  assert.deepEqual(p.view.months.map((m) => m.status), [...rep6('before_system'), 'paid', 'paid', 'due', 'due', 'upcoming', 'upcoming']);
  assert.deepEqual(p.totals, { paid: 104000, owed: 104000, ahead: 0, paidMonths: 2, beforeSystemMonths: 6, dueMonths: 2 });
  assert.deepEqual(p.due, buildLandlordDue(contact, JULY_AUG, TODAY, { goLiveMonth: GO_LIVE }));
  assert.equal(p.due.owed, p.totals.owed, 'the figure of the strip and the figure of the grid are one');
  assert.equal(p.lastPayment.date, '2026-08-31');
  assert.equal(p.payments.length, 4);
  assert.deepEqual(p.payments.map((x) => x.date), ['2026-08-31', '2026-08-31', '2026-07-31', '2026-07-30']);
  for (const x of p.payments) {
    assert.equal(x.parts.length, 1);
    assert.equal(x.parts[0].how, 'payment_month');
    assert.equal(x.advance, false);
  }
  assert.deepEqual(p.payments.filter((x) => x.date === '2026-07-31').map((x) => [x.parts[0].monthKey, x.parts[0].amount]), [['2026-07', 27000]]);
});
function rep6(s) { return Array(6).fill(s); }

check('profile: what is paid and what is owed make the months up to now; a payment ahead is explained', () => {
  const contact = landlord({ notes: '[role:landlord]\n[since:2026-01]' });
  const history = [...named(1, 8), pay(4000, '2026-09-04', rentFor('سبتمبر')), pay(10000, '2026-09-05', rentFor('ديسمبر', 2026))];
  const p = profileOf(contact, history);
  assert.equal(p.totals.paid, 94000);
  assert.equal(p.totals.ahead, 10000);
  assert.equal(p.totals.owed, 16000);
  // 10 months to date at 10,000 = what was paid for them + what still lacks
  assert.equal(p.totals.paid - p.totals.ahead + p.totals.owed, 100000);
  const ahead = p.payments.find((x) => x.amount === 10000 && x.date === '2026-09-05');
  assert.equal(ahead.advance, true);
  assert.deepEqual(ahead.parts, [{ monthKey: '2026-12', amount: 10000, how: 'named' }]);
  assert.equal(p.view.months[11].status, 'paid');
  assert.equal(p.due.owed, p.totals.owed);
});

check('profile: another year, a clamped year, and only this landlord\'s counted payments', () => {
  const contact = landlord({ notes: '[role:landlord]\n[since:2025-10]' });
  const history = [pay(10000, '2025-11-03', rentFor('نوفمبر', 2025)), ...named(1, 3), pay(9999, '2026-02-03', rentFor('فبراير'), { contact_id: 'other' }), pay(9999, '2026-02-04', rentFor('فبراير'), { kind: 'REVENUE' }), pay(9999, '2026-02-05', rentFor('فبراير'), { status: 'DRAFT' })];
  const prev = profileOf(contact, history, { year: 2025 });
  assert.equal(prev.year, 2025);
  assert.equal(prev.view.months[9].monthKey, '2025-10');
  assert.equal(prev.view.months[9].status, 'due');
  assert.equal(prev.view.months[10].status, 'paid');
  assert.equal(prev.view.months[8].status, 'before_system');
  assert.deepEqual(prev.years, { min: 2025, max: 2027 });
  assert.equal(profileOf(contact, history, { year: 1990 }).year, 2025);
  assert.equal(profileOf(contact, history, { year: 2100 }).year, 2027);
  assert.equal(prev.payments.length, 4, 'a payment of another landlord, a revenue and a draft are not payments to this landlord');
});

check('profile: the tracking start in effect and the one the system would pick without it', () => {
  const contact = landlord({ monthly_rent: null, notes: '[role:landlord]\n[since:2026-03]' });
  const p = profileOf(contact, JULY_AUG);
  assert.deepEqual(p.tracking, { month: '2026-03', source: 'tag' });
  assert.deepEqual(p.defaultTracking, { month: '2026-07', source: 'first_payment' });
  const none = profileOf(landlord({ monthly_rent: null }), []);
  assert.deepEqual(none.defaultTracking, { month: '2026-06', source: 'go_live' });
  assert.deepEqual(profileOf(landlord({ monthly_rent: null }), [], { goLiveMonth: null }).defaultTracking, { month: null, source: 'none' });
});

check('profile: choosing a tracking start previews what it would make owed, and changes nothing', () => {
  const contact = landlord({ monthly_rent: null });
  const input = { contact, payments: JULY_AUG, today: TODAY, goLiveMonth: GO_LIVE };
  assert.deepEqual(previewTrackingStart(input, null), { owedMonths: 2, amount: 104000, amountComplete: true, estimated: true, oldest: '2026-09' });
  // from January: June back to January have no payment, so they would read as owed, at the estimated amount
  assert.deepEqual(previewTrackingStart(input, '2026-01'), { owedMonths: 8, amount: 416000, amountComplete: true, estimated: true, oldest: '2026-01' });
  assert.deepEqual(previewTrackingStart(input, '2026-10'), { owedMonths: 1, amount: 52000, amountComplete: true, estimated: true, oldest: '2026-10' });
  assert.equal(contact.notes, '[role:landlord]');
  assert.throws(() => previewTrackingStart(input, '2026-13'), RangeError);
});

// ---------- the edits the profile offers, and the payment a month starts ----------

check('a typed monthly rent: Arabic digits and separators are read, empty, zero, negative and junk are refused with a reason', () => {
  assert.deepEqual(monthlyRentFromInput('52000'), { ok: true, amount: 52000, value: '52000' });
  assert.deepEqual(monthlyRentFromInput('٥٢٬٠٠٠'), { ok: true, amount: 52000, value: '52000' });
  assert.deepEqual(monthlyRentFromInput('1,250.5'), { ok: true, amount: 1250.5, value: '1250.5' });
  assert.deepEqual(monthlyRentFromInput(' 27000.125 '), { ok: true, amount: 27000.125, value: '27000.125' });
  assert.deepEqual(monthlyRentFromInput(''), { ok: false, error: 'أدخل الإيجار الشهري.' });
  assert.deepEqual(monthlyRentFromInput('   '), { ok: false, error: 'أدخل الإيجار الشهري.' });
  assert.equal(monthlyRentFromInput('0').ok, false);
  assert.equal(monthlyRentFromInput('-5').ok, false);
  assert.equal(monthlyRentFromInput('abc').ok, false);
  assert.equal(monthlyRentFromInput('1.23456').ok, false, 'more than three decimals');
  assert.equal(monthlyRentFromInput('1e9').ok, false);
  assert.equal(monthlyRentFromInput('999999999999').ok, false, 'beyond what the column holds');
  assert.equal(monthlyRentFromInput(null).ok, false);
  assert.deepEqual(monthlyRentPatch(52000), { monthly_rent: '52000' });
});

check('the tracking-start update keeps the text and the role tag, adds or removes only the since tag', () => {
  const contact = { notes: 'عقار على شارع الجمهورية\n[role:landlord]' };
  assert.deepEqual(trackingStartPatch(contact, '2026-03'), { notes: 'عقار على شارع الجمهورية\n[role:landlord]\n[since:2026-03]' });
  assert.deepEqual(trackingStartPatch({ notes: '[role:landlord]\n[since:2026-03]' }, null), { notes: '[role:landlord]' });
  assert.deepEqual(trackingStartPatch({ notes: '[role:landlord]\n[since:2026-03]' }, '2026-05'), { notes: '[role:landlord]\n[since:2026-05]' });
  assert.deepEqual(trackingStartPatch({ notes: null }, null), { notes: null });
  assert.deepEqual(trackingStartPatch({ notes: '[ROLE: Landlord ]\r\nملاحظة' }, '2026-02'), { notes: 'ملاحظة\n[role:landlord]\n[since:2026-02]' });
  assert.throws(() => trackingStartPatch(contact, '2026-13'), RangeError);
  assert.equal(contact.notes, 'عقار على شارع الجمهورية\n[role:landlord]', 'the contact is not changed');
});

check('the line above the grid says where the months stop being judged and where that came from', () => {
  assert.deepEqual(trackingLineText({ month: '2026-07', source: 'first_payment' }), { text: 'الأشهر قبل يوليو 2026 تُعدّ مسدّدة قبل المنظومة.', source: 'من أول دفعة مسجّلة' });
  assert.deepEqual(trackingLineText({ month: '2026-03', source: 'tag' }), { text: 'الأشهر قبل مارس 2026 تُعدّ مسدّدة قبل المنظومة.', source: 'محدّدة يدوياً' });
  assert.deepEqual(trackingLineText({ month: '2026-06', source: 'go_live' }).source, 'من بداية تشغيل المنظومة');
  assert.deepEqual(trackingLineText({ month: null, source: 'none' }), { text: 'بداية المتابعة غير محدّدة، فلا تُعرف حالة الأشهر.', source: 'غير محدّدة' });
});

check('the preview of a tracking start says what would read as owed, with the floor and the estimate told', () => {
  const contact = landlord({ monthly_rent: null });
  const input = { contact, payments: JULY_AUG, today: TODAY, goLiveMonth: GO_LIVE };
  // no monthly rent is recorded, so these sums stand on the amount of the latest paid month and say so
  assert.equal(trackingPreviewText(previewTrackingStart(input, null)), `بهذه البداية يظهر مستحقاً شهران منذ سبتمبر 2026، بمبلغ ${formatMoneyOf(104000)} تقريباً.`);
  assert.equal(trackingPreviewText(previewTrackingStart(input, '2026-01')), `بهذه البداية يظهر مستحقاً 8 أشهر منذ يناير 2026، بمبلغ ${formatMoneyOf(416000)} تقريباً.`);
  // a recorded rent makes the amount exact: no qualifier
  const rented = landlord({ monthly_rent: '10000', notes: '[role:landlord]' });
  const eight = [1, 2, 3, 4, 5, 6, 7, 8].map((m) => pay(10000, `2026-${String(m).padStart(2, '0')}-05`, rentFor(roles.landlordMonthName(m))));
  assert.equal(trackingPreviewText(previewTrackingStart({ contact: rented, payments: eight, today: TODAY, goLiveMonth: GO_LIVE }, '2026-01')), `بهذه البداية يظهر مستحقاً شهران منذ سبتمبر 2026، بمبلغ ${formatMoneyOf(20000)}.`);
  const paidUp = landlord({ monthly_rent: '10000', notes: '[role:landlord]' });
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((m) => pay(10000, `2026-${String(m).padStart(2, '0')}-05`, rentFor(roles.landlordMonthName(m))));
  assert.equal(trackingPreviewText(previewTrackingStart({ contact: paidUp, payments: all, today: TODAY, goLiveMonth: GO_LIVE }, '2026-01')), 'بهذه البداية لا يظهر شيء مستحق.');
  assert.equal(trackingPreviewText({ owedMonths: 1, amount: 52000, amountComplete: false, oldest: null }), `بهذه البداية يظهر مستحقاً شهر واحد، بمبلغ ${formatMoneyOf(52000)} على الأقل.`);
  assert.equal(trackingPreviewText({ owedMonths: 1, amount: 52000, amountComplete: false, estimated: true, oldest: null }), `بهذه البداية يظهر مستحقاً شهر واحد، بمبلغ ${formatMoneyOf(52000)} على الأقل.`, 'a floor wins over a guess: one qualifier, not two');
});

check('the payment a month starts: the rest of the month, empty when only a guess, the month named in the text', () => {
  const m = (over = {}) => ({ monthKey: '2026-09', monthNameAr: 'سبتمبر', year: 2026, remaining: 52000, remainingKnown: true, estimated: false, ...over });
  const p = landlordPaymentFor('الحاج مصطفى', m(), TODAY);
  assert.deepEqual({ ...p, description: undefined }, { monthKey: '2026-09', monthNameAr: 'سبتمبر', year: 2026, amount: 52000, estimated: false, late: true, description: undefined });
  assert.equal(landlordPaymentMonthKey({ description: p.description, tx_date: '1999-06-15' }), '2026-09', 'the engine reads the same month back');
  assert.equal(landlordPaymentFor('x', m({ estimated: true }), TODAY).amount, null, 'an estimate is not typed in');
  assert.equal(landlordPaymentFor('x', m({ remainingKnown: false, remaining: 0 }), TODAY).amount, null);
  assert.equal(landlordPaymentFor('x', m({ remaining: 0 }), TODAY).amount, null);
  assert.equal(landlordPaymentFor('x', m({ monthKey: '2026-10', monthNameAr: 'أكتوبر' }), TODAY).late, false, 'the current month is not late');
});

check('the dues carry the twelve months of the year for the strip, in the engine\'s statuses', () => {
  const d = buildLandlordDue(landlord({ monthly_rent: null }), JULY_AUG, TODAY, { goLiveMonth: GO_LIVE });
  assert.equal(d.yearMonths.length, 12);
  assert.deepEqual(d.yearMonths.map((x) => x.status), [...rep6('before_system'), 'paid', 'paid', 'due', 'due', 'upcoming', 'upcoming']);
  assert.deepEqual(d.yearMonths.filter((x) => x.current).map((x) => x.monthKey), ['2026-10']);
  assert.deepEqual(d.yearMonths.filter((x) => x.overdue).map((x) => x.monthKey), ['2026-09']);
});

check('the money in the system never moves: the inputs are not changed by either model', () => {
  const contact = landlord({ monthly_rent: null });
  const before = JSON.stringify([contact, JULY_AUG]);
  buildLandlordDue(contact, JULY_AUG, TODAY, { goLiveMonth: GO_LIVE });
  profileOf(contact, JULY_AUG);
  assert.equal(JSON.stringify([contact, JULY_AUG]), before);
});

check('profile and house rule: reconciled entries count as money, drafts and voided ones do not', () => {
  const rows = [{ id: 'a', status: 'POSTED' }, { id: 'b', status: 'RECONCILED' }, { id: 'c', status: 'DRAFT' }, { id: 'd', status: 'VOIDED' }, { id: 'e' }];
  assert.deepEqual(counted.getCountedContactTransactions(rows).map((r) => r.id), ['a', 'b']);
  assert.equal(counted.isCountedTransaction({ status: 'RECONCILED' }), true);
  assert.equal(counted.isCountedTransaction({ status: null }), false);
});

console.log(`\n✓ verify-landlord-dues: ${passed} checks passed`);
