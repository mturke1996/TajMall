/**
 * What the mall owes its landlords: the month-by-month rent schedule (which payments count, which months are
 * owed, what a contract's dates do), the payment text the schedule reads back, and the dues model built on it
 * (this month, earlier months, the payment to start, the order of urgency, totals).
 *   npx tsx scripts/verify-landlord-dues.mjs
 */
import assert from 'node:assert/strict';

const roles = await import('../src/lib/contacts/contact-roles.ts');
const dues = await import('../src/lib/landlord-dues.ts');
const counted = await import('../src/lib/contacts/contact-transactions.ts');
const { buildLandlordRentSchedule, landlordPaymentDescription, landlordPaymentMonthKey } = roles;
const { buildLandlordDue, buildLandlordDues, selectDueLandlords, compareLandlordDues, landlordDuesWindowStart, landlordDuesAttention, landlordDueHeadline, landlordArrearsText, landlordPayLabel } = dues;

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
  assert.equal(landlordDuesWindowStart(TODAY), '2025-07-01');
  assert.equal(landlordDuesWindowStart('2027-01-01'), '2026-07-01');
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

// ---------- one landlord's dues ----------

check('paid in full this month: nothing remains and there is no payment to start', () => {
  const d = buildLandlordDue(landlord(), [...Array.from({ length: 10 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1))))], TODAY);
  assert.equal(d.status, 'paid');
  assert.deepEqual([d.due, d.paid, d.remaining, d.owed], [10000, 10000, 0, 0]);
  assert.equal(d.arrears.months.length, 0);
  assert.equal(d.next, null);
  assert.equal(landlordDueHeadline(d), 'سُدّد إيجار هذا الشهر');
});

check('nothing paid this month and nothing earlier owed: unpaid, and the payment starts at this month', () => {
  const earlier = Array.from({ length: 9 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1))));
  const d = buildLandlordDue(landlord(), earlier, TODAY);
  assert.equal(d.status, 'unpaid');
  assert.equal(d.remaining, 10000);
  assert.equal(d.owed, 10000);
  assert.deepEqual(d.next, { monthKey: '2026-10', monthNameAr: 'أكتوبر', year: 2026, amount: 10000, late: false, description: 'سداد إيجار شهر أكتوبر 2026 للمؤجر الحاج مصطفى' });
  assert.equal(landlordDueHeadline(d), 'لم يُسدَّد إيجار هذا الشهر');
  assert.equal(landlordPayLabel(d.next), 'سداد أكتوبر');
});

check('part of this month paid: partial, with the rest to pay', () => {
  const earlier = Array.from({ length: 9 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1))));
  const d = buildLandlordDue(landlord(), [...earlier, pay(3500.25, '2026-10-05', rentFor('أكتوبر'))], TODAY);
  assert.equal(d.status, 'partial');
  assert.deepEqual([d.paid, d.remaining], [3500.25, 6499.75]);
  assert.equal(d.next.amount, 6499.75);
  assert.equal(landlordDueHeadline(d), 'سُدّد جزء من إيجار هذا الشهر');
});

check('earlier months unpaid: arrears, listed oldest first, and the payment starts at the oldest', () => {
  const paid = [1, 2, 3, 4, 5, 6, 9].map((n) => pay(10000, `2026-${String(n).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(n))));
  const d = buildLandlordDue(landlord(), [...paid, pay(4000, '2026-08-01', rentFor('أغسطس'))], TODAY);
  assert.equal(d.status, 'arrears');
  assert.deepEqual(d.arrears.months.map((m) => [m.monthKey, m.remaining]), [['2026-07', 10000], ['2026-08', 6000]]);
  assert.equal(d.arrears.amount, 16000);
  assert.equal(d.remaining, 10000);
  assert.equal(d.owed, 26000);
  assert.equal(d.next.monthKey, '2026-07');
  assert.equal(d.next.amount, 10000);
  assert.equal(d.next.late, true);
  assert.equal(d.next.description, 'سداد إيجار شهر يوليو 2026 للمؤجر الحاج مصطفى');
  assert.equal(landlordDueHeadline(d), 'إيجار متأخر: شهران');
  assert.equal(landlordArrearsText(d), 'يوليو وأغسطس');
});

check('arrears while this month is already paid still count as arrears', () => {
  const d = buildLandlordDue(landlord(), [pay(10000, '2026-10-02', rentFor('أكتوبر'))], TODAY);
  assert.equal(d.status, 'arrears');
  assert.equal(d.remaining, 0);
  assert.equal(d.arrears.months.length, 9);
  assert.equal(d.owed, 90000);
  assert.equal(d.next.monthKey, '2026-01');
});

check('contract ended or not begun: no rent this month, and the reason is given', () => {
  const ended = buildLandlordDue(landlord({ contract_start: '2025-01-01', contract_end: '2026-10-05' }), Array.from({ length: 10 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1)))), TODAY);
  assert.equal(ended.status, 'paid', 'the contract still covers October (its end month)');
  const over = buildLandlordDue(landlord({ contract_start: '2025-01-01', contract_end: '2026-09-30' }), Array.from({ length: 9 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1)))), TODAY);
  assert.equal(over.status, 'none');
  assert.equal(over.idleReason, 'after_contract');
  assert.equal(over.owed, 0);
  assert.equal(landlordDueHeadline(over), 'العقد منتهٍ، لا إيجار هذا الشهر');
  const later = buildLandlordDue(landlord({ contract_start: '2026-11-01' }), [], TODAY);
  assert.equal(later.status, 'none');
  assert.equal(later.idleReason, 'before_contract');
  assert.equal(landlordDueHeadline(later), 'العقد لم يبدأ، لا إيجار هذا الشهر');
});

check('an ended contract with unpaid months inside it is still owed', () => {
  const d = buildLandlordDue(landlord({ contract_start: '2026-01-01', contract_end: '2026-06-30' }), Array.from({ length: 4 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1)))), TODAY);
  assert.equal(d.status, 'arrears');
  assert.equal(d.arrears.amount, 20000);
  assert.equal(d.remaining, 0);
  assert.equal(d.due, 0);
});

check('a transaction list that includes other people and other years is read correctly', () => {
  const d = buildLandlordDue(
    landlord(),
    [pay(10000, '2025-10-03', rentFor('أكتوبر', 2025)), pay(7000, '2026-10-03', rentFor('أكتوبر'), { contact_id: 'someone-else' }), pay(1000, '2026-10-04', rentFor('أكتوبر'))],
    TODAY,
  );
  assert.equal(d.paid, 1000, 'last year\'s October and another party\'s payment are not this October');
});

check('a today that is not a date fails loudly instead of giving an answer', () => {
  assert.throws(() => buildLandlordDue(landlord(), [], 'soon'), RangeError);
});

// ---------- every landlord ----------

check('only active landlords with a monthly rent are listed; those without a rent are counted', () => {
  const contacts = [
    landlord({ id: 'L1' }),
    landlord({ id: 'L2', monthly_rent: '0' }),
    landlord({ id: 'L3', monthly_rent: null }),
    landlord({ id: 'L4', is_active: false }),
    { id: 'S1', kind: 'VENDOR', name: 'مورد مياه', job_title: 'مياه', department: 'مياه', monthly_rent: '500', notes: '[role:supplier_water]', is_active: true },
    { id: 'T1', kind: 'TENANT', name: 'مستأجر', monthly_rent: '3000', is_active: true },
    landlord({ id: 'L5', notes: null, job_title: null, monthly_rent: '2500' }),
  ];
  const { landlords, noRent } = selectDueLandlords(contacts);
  assert.deepEqual(landlords.map((c) => c.id), ['L1', 'L5'], 'a vendor with a rent and no other role is a landlord, as everywhere else');
  assert.equal(noRent, 2);
});

check('landlords are ordered by urgency, and the order is stable for equal cases', () => {
  const month = (n) => `2026-${String(n).padStart(2, '0')}`;
  const paidThrough = (id, upTo) => Array.from({ length: upTo }, (_, i) => pay(1000, `${month(i + 1)}-03`, rentFor(roles.landlordMonthName(i + 1)), { contact_id: id }));
  const contacts = [
    landlord({ id: 'paid', name: 'ب مسدد', monthly_rent: '1000' }),
    landlord({ id: 'partial', name: 'ج جزئي', monthly_rent: '1000' }),
    landlord({ id: 'unpaid-big', name: 'د كبير', monthly_rent: '5000' }),
    landlord({ id: 'unpaid-small', name: 'ه صغير', monthly_rent: '500' }),
    landlord({ id: 'arrears-new', name: 'و حديث', monthly_rent: '1000' }),
    landlord({ id: 'arrears-old', name: 'ز قديم', monthly_rent: '1000' }),
    landlord({ id: 'none', name: 'ح منتهٍ', monthly_rent: '1000', contract_end: '2026-06-30' }),
    landlord({ id: 'tie-b', name: 'ي ب', monthly_rent: '1000' }),
    landlord({ id: 'tie-a', name: 'ي أ', monthly_rent: '1000' }),
  ];
  const tx = [
    ...paidThrough('paid', 10),
    ...paidThrough('partial', 9),
    pay(400, '2026-10-02', rentFor('أكتوبر'), { contact_id: 'partial' }),
    ...paidThrough('unpaid-big', 0),
    ...Array.from({ length: 9 }, (_, i) => pay(5000, `${month(i + 1)}-03`, rentFor(roles.landlordMonthName(i + 1)), { contact_id: 'unpaid-big' })),
    ...paidThrough('unpaid-small', 9),
    ...paidThrough('arrears-new', 8).concat([pay(1000, '2026-10-01', rentFor('أكتوبر'), { contact_id: 'arrears-new' })]),
    ...paidThrough('arrears-old', 5).concat([pay(1000, '2026-10-01', rentFor('أكتوبر'), { contact_id: 'arrears-old' })]),
    ...paidThrough('none', 6),
    ...paidThrough('tie-b', 9),
    ...paidThrough('tie-a', 9),
  ];
  const d = buildLandlordDues({ contacts, transactions: tx, today: TODAY });
  assert.deepEqual(d.rows.map((r) => r.contactId), ['arrears-old', 'arrears-new', 'unpaid-big', 'tie-a', 'tie-b', 'unpaid-small', 'partial', 'paid', 'none']);
  assert.deepEqual(d.rows.map((r) => r.status), ['arrears', 'arrears', 'unpaid', 'unpaid', 'unpaid', 'unpaid', 'partial', 'paid', 'none']);
  for (let i = 1; i < d.rows.length; i++) assert.ok(compareLandlordDues(d.rows[i - 1], d.rows[i]) <= 0);
});

check('totals add up the rows: this month, arrears, and what is owed overall', () => {
  const contacts = [landlord({ id: 'A', monthly_rent: '10000' }), landlord({ id: 'B', monthly_rent: '4000.5' }), landlord({ id: 'C', monthly_rent: '0' })];
  const tx = [
    ...Array.from({ length: 9 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1)), { contact_id: 'A' })),
    pay(2000.5, '2026-10-04', rentFor('أكتوبر'), { contact_id: 'B' }),
  ];
  const d = buildLandlordDues({ contacts, transactions: tx, today: TODAY });
  assert.equal(d.month, '2026-10');
  assert.equal(d.monthNameAr, 'أكتوبر');
  assert.equal(d.year, 2026);
  const t = d.totals;
  assert.equal(t.landlords, 2);
  assert.equal(t.due, 14000.5);
  assert.equal(t.paid, 2000.5);
  assert.equal(t.remaining, 12000);
  // B owes its nine earlier months too: nothing was paid for January to September
  assert.equal(t.arrears, 36004.5);
  assert.equal(t.owed, 48004.5);
  assert.equal(t.owing, 2);
  assert.equal(t.behind, 1);
  assert.equal(d.noRent, 1);
});

check('no landlords: an empty, zeroed result, not an error', () => {
  const d = buildLandlordDues({ contacts: [], transactions: [], today: TODAY });
  assert.deepEqual(d.rows, []);
  assert.deepEqual(d.totals, { landlords: 0, due: 0, paid: 0, remaining: 0, arrears: 0, owed: 0, owing: 0, behind: 0 });
  assert.equal(d.noRent, 0);
  assert.equal(landlordDuesAttention(d), null);
});

check('the dashboard summary: nothing owed gives none, this month only warns, an earlier month is bad', () => {
  const settled = buildLandlordDues({
    contacts: [landlord()],
    transactions: Array.from({ length: 10 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1)))),
    today: TODAY,
  });
  assert.equal(landlordDuesAttention(settled), null);

  const monthOnly = buildLandlordDues({
    contacts: [landlord()],
    transactions: Array.from({ length: 9 }, (_, i) => pay(10000, `2026-${String(i + 1).padStart(2, '0')}-03`, rentFor(roles.landlordMonthName(i + 1)))),
    today: TODAY,
  });
  assert.deepEqual(landlordDuesAttention(monthOnly), { count: 1, amount: 10000, tone: 'warn', href: '/mall?tab=people&role=LANDLORD' });

  const behind = buildLandlordDues({ contacts: [landlord(), landlord({ id: 'L2' })], transactions: [], today: TODAY });
  const attention = landlordDuesAttention(behind);
  assert.equal(attention.count, 2);
  assert.equal(attention.amount, 200000);
  assert.equal(attention.tone, 'bad');
});

check('the first of the month and the last of the year change the current month, not the arrears logic', () => {
  const first = buildLandlordDue(landlord(), [], '2026-10-01');
  assert.equal(first.remaining, 10000);
  assert.equal(first.arrears.months.length, 9);
  const jan = buildLandlordDue(landlord(), [], '2026-01-01');
  assert.equal(jan.status, 'unpaid');
  assert.equal(jan.arrears.months.length, 0);
  const dec = buildLandlordDue(landlord(), [], '2026-12-31');
  assert.equal(dec.arrears.months.length, 11);
  assert.equal(dec.next.monthKey, '2026-01');
});

check('arrears wording agrees with the count: one, two, three, many', () => {
  const rowWith = (n) => ({ arrears: { amount: n, months: Array.from({ length: n }, (_, i) => ({ monthKey: `2026-${String(i + 1).padStart(2, '0')}`, monthNameAr: roles.landlordMonthName(i + 1), year: 2026, due: 1, paid: 0, remaining: 1 })) } });
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
});

check('profile and house rule: reconciled entries count as money, drafts and voided ones do not', () => {
  const rows = [{ id: 'a', status: 'POSTED' }, { id: 'b', status: 'RECONCILED' }, { id: 'c', status: 'DRAFT' }, { id: 'd', status: 'VOIDED' }, { id: 'e' }];
  assert.deepEqual(counted.getCountedContactTransactions(rows).map((r) => r.id), ['a', 'b']);
  assert.equal(counted.isCountedTransaction({ status: 'RECONCILED' }), true);
  assert.equal(counted.isCountedTransaction({ status: null }), false);
});

console.log(`\n✓ verify-landlord-dues: ${passed} checks passed`);
