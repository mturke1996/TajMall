/**
 * Month-by-month status of a recurring obligation (the rent the mall pays a landlord): which months were
 * settled before the system existed, which are paid, part-paid, due or still to come, which month a payment
 * belongs to, and the totals a list or the dashboard shows.
 *   npx tsx scripts/verify-obligation-months.mjs
 */
import assert from 'node:assert/strict';

const om = await import('../src/lib/people/obligation-months.ts');
const roles = await import('../src/lib/contacts/contact-roles.ts');
const {
  buildObligationYear, buildObligationLast12, summarizeObligation, aggregateObligations, goLiveMonthOf, groupPaymentsByContact,
  namedMonthKeys, addMonths, OBLIGATION_LABEL, obligationMonthsText,
} = om;

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-19';
let seq = 0;
const pay = (amount, date, description = null, over = {}) => ({
  id: `p${++seq}`,
  tx_date: date,
  amount: typeof amount === 'number' ? String(amount) : amount,
  status: 'POSTED',
  kind: 'EXPENSE',
  contact_id: 'L1',
  description,
  ...over,
});
const landlord = (over = {}) => ({ id: 'L1', notes: '[role:landlord]', monthly_rent: null, contract_start: null, contract_end: null, ...over });
const year = (contact, payments, over = {}) => buildObligationYear({ contact, payments, today: TODAY, year: 2026, ...over });
const statuses = (v) => v.months.map((m) => m.status);
const month = (v, key) => v.months.find((m) => m.monthKey === key);
const rep = (n, s) => Array(n).fill(s);

// ---------------------------------------------------------------- the worked examples

const JULY_AUG = [pay(25000, '2026-07-30'), pay(27000, '2026-07-31'), pay(27000, '2026-08-31'), pay(25000, '2026-08-31')];

check('worked example: no month in the text, no monthly rent, system live 1 June 2026', () => {
  const v = year(landlord(), JULY_AUG, { goLiveMonth: '2026-06' });
  assert.deepEqual(statuses(v), [...rep(6, 'before_system'), 'paid', 'paid', 'due', 'due', 'upcoming', 'upcoming']);
  assert.equal(month(v, '2026-07').paid, 52000);
  assert.equal(month(v, '2026-08').paid, 52000);
  // the guess for a month with nothing paid is the latest recorded month
  for (const key of ['2026-09', '2026-10']) {
    const m = month(v, key);
    assert.equal(m.expected, 52000, key);
    assert.equal(m.estimated, true, key);
    assert.equal(m.remaining, 52000, key);
    assert.equal(m.remainingKnown, true, key);
  }
  assert.equal(month(v, '2026-09').overdue, true);
  assert.equal(month(v, '2026-10').overdue, false);
  assert.equal(month(v, '2026-10').current, true);
  assert.equal(month(v, '2026-11').expected, 52000);
  assert.equal(month(v, '2026-11').remaining, 0, 'nothing is owed for a month that has not come');
  // paid months carry no guess
  assert.equal(month(v, '2026-07').estimated, false);
  assert.deepEqual(v.tracking, { month: '2026-07', source: 'first_payment' });
  assert.equal(v.amountSource, 'estimate');
  assert.equal(v.monthlyAmount, 52000);
});

check('worked example: labels and totals', () => {
  const v = year(landlord(), JULY_AUG, { goLiveMonth: '2026-06' });
  assert.equal(month(v, '2026-01').label, 'مسدّد قبل المنظومة');
  assert.equal(OBLIGATION_LABEL.before_system, 'مسدّد قبل المنظومة');
  assert.equal(month(v, '2026-07').label, 'مسدّد');
  assert.equal(month(v, '2026-09').label, 'متأخر');
  assert.equal(month(v, '2026-10').label, 'مستحق');
  assert.equal(month(v, '2026-12').label, 'قادم');
  const s = v.summary;
  assert.deepEqual([s.beforeSystem, s.paid, s.partial, s.due, s.upcoming, s.idle], [6, 2, 0, 2, 2, 0]);
  assert.deepEqual(s.owed, { months: 2, overdue: 1, amount: 104000, amountComplete: true, estimated: true, oldest: '2026-09', newest: '2026-10' });
});

check('"ايجار شهر يوليو" paid on 5 August belongs to July', () => {
  const v = year(landlord(), [pay(50000, '2026-08-05', 'ايجار شهر يوليو')]);
  assert.equal(month(v, '2026-07').paid, 50000);
  assert.equal(month(v, '2026-07').status, 'paid');
  assert.equal(month(v, '2026-08').paid, 0);
  assert.equal(month(v, '2026-07').shares[0].how, 'named');
  // tracking starts when the system first saw them, August; July is paid and June is before the system
  assert.equal(v.tracking.month, '2026-08');
  assert.equal(month(v, '2026-06').status, 'before_system');
  assert.equal(month(v, '2026-08').status, 'due');
});

// ---------------------------------------------------------------- tracking start

check('tracking start: the tag beats the first payment', () => {
  const v = year(landlord({ notes: '[role:landlord]\n[since:2026-03]' }), JULY_AUG);
  assert.deepEqual(v.tracking, { month: '2026-03', source: 'tag' });
  assert.deepEqual(statuses(v).slice(0, 8), ['before_system', 'before_system', 'due', 'due', 'due', 'due', 'paid', 'paid']);
});

check('tracking start: the first payment beats the go-live month, even when go-live is earlier', () => {
  const v = year(landlord(), JULY_AUG, { goLiveMonth: '2026-01' });
  assert.deepEqual(v.tracking, { month: '2026-07', source: 'first_payment' });
  assert.equal(month(v, '2026-03').status, 'before_system');
});

check('tracking start: no payment at all uses the go-live month; months with no known amount are due without an amount', () => {
  const v = year(landlord(), [], { goLiveMonth: '2026-06' });
  assert.deepEqual(v.tracking, { month: '2026-06', source: 'go_live' });
  assert.deepEqual(statuses(v), [...rep(5, 'before_system'), ...rep(5, 'due'), 'upcoming', 'upcoming']);
  const jun = month(v, '2026-06');
  assert.equal(jun.expected, null);
  assert.equal(jun.remaining, 0);
  assert.equal(jun.remainingKnown, false);
  assert.equal(v.amountSource, 'unknown');
  assert.equal(v.monthlyAmount, null);
  assert.deepEqual(v.summary.owed, { months: 5, overdue: 4, amount: 0, amountComplete: false, estimated: false, oldest: '2026-06', newest: '2026-10' });
});

check('tracking start: nothing known means the past can not be judged, never "owed" or "settled"', () => {
  const v = year(landlord(), []);
  assert.equal(v.tracking.source, 'none');
  assert.deepEqual(statuses(v), [...rep(10, 'idle'), 'upcoming', 'upcoming']);
  assert.equal(month(v, '2026-03').idleReason, 'unknown_start');
  assert.equal(month(v, '2026-03').label, 'بداية المتابعة غير محدّدة');
  assert.equal(v.summary.owed.months, 0);
  assert.equal(v.summary.beforeSystem, 0);
});

check('tracking start: a bad tag or go-live month is ignored', () => {
  const v = year(landlord({ notes: '[role:landlord]\n[since:2026-13]' }), JULY_AUG, { goLiveMonth: 'soon' });
  assert.equal(v.tracking.source, 'first_payment');
  assert.equal(year(landlord(), [], { goLiveMonth: '2026-6' }).tracking.source, 'none');
});

check('tracking start in the future: its earlier months are settled, nothing is owed', () => {
  const v = year(landlord({ notes: '[since:2026-12]' }), []);
  assert.deepEqual(statuses(v), [...rep(11, 'before_system'), 'upcoming']);
  assert.equal(v.summary.owed.months, 0);
});

check('a month with money is paid even when it is earlier than the tracking start', () => {
  const v = year(landlord({ notes: '[since:2026-07]' }), [pay(52000, '2026-07-02', 'إيجار شهر يونيو')]);
  assert.equal(month(v, '2026-06').status, 'paid');
  assert.equal(month(v, '2026-05').status, 'before_system');
});

check('a tag far in the past does not make a page walk for ever', () => {
  const t = Date.now();
  const v = year(landlord({ notes: '[since:1900-01]', monthly_rent: '1000' }), [pay(1000, '2026-07-01')]);
  assert.ok(Date.now() - t < 1500);
  assert.ok(v.summary.owed.months > 0);
  assert.ok(v.summary.owed.months <= 241);
});

// ---------------------------------------------------------------- amounts

check('a monthly rent is the amount; no estimate is used and a part-paid month is partial', () => {
  const v = year(landlord({ monthly_rent: '1000' }), [pay(1000, '2026-07-15', 'إيجار شهر يوليو'), pay(400, '2026-08-15', 'إيجار شهر أغسطس')]);
  assert.equal(v.amountSource, 'monthly_rent');
  assert.equal(month(v, '2026-07').status, 'paid');
  assert.equal(month(v, '2026-07').expected, 1000);
  const aug = month(v, '2026-08');
  assert.equal(aug.status, 'partial');
  assert.equal(aug.remaining, 600);
  assert.equal(aug.overdue, true);
  assert.equal(aug.label, 'مسدّد جزئياً');
  const sep = month(v, '2026-09');
  assert.deepEqual([sep.status, sep.expected, sep.estimated, sep.remaining], ['due', 1000, false, 1000]);
  assert.deepEqual(v.summary.owed, { months: 3, overdue: 2, amount: 600 + 1000 + 1000, amountComplete: true, estimated: false, oldest: '2026-08', newest: '2026-10' });
});

check('a second payment completes the month; a surplus is reported as overpaid', () => {
  const v = year(landlord({ monthly_rent: '1000' }), [pay(400, '2026-08-15', 'إيجار شهر أغسطس'), pay(600, '2026-08-20', 'إيجار شهر أغسطس'), pay(1200, '2026-07-15', 'إيجار شهر يوليو')]);
  assert.equal(month(v, '2026-08').status, 'paid');
  assert.equal(month(v, '2026-08').shares.length, 2);
  assert.equal(month(v, '2026-07').overpaid, 200);
});

check('without a rent, any money makes a month paid; an estimate never makes a month part-paid', () => {
  const v = year(landlord(), [pay(52000, '2026-07-31'), pay(20000, '2026-08-31')]);
  assert.equal(month(v, '2026-08').status, 'paid');
  assert.equal(month(v, '2026-08').expected, null);
  // the latest finished month with money is August: 20,000
  assert.equal(month(v, '2026-09').expected, 20000);
});

check('the estimate comes from a finished month first, the current month only when it is all there is', () => {
  const onlyThisMonth = year(landlord(), [pay(30000, '2026-10-03')]);
  assert.equal(month(onlyThisMonth, '2026-10').status, 'paid');
  assert.equal(month(onlyThisMonth, '2026-11').expected, 30000);
  assert.equal(month(onlyThisMonth, '2026-11').estimated, true);
  const both = year(landlord(), [pay(52000, '2026-09-02'), pay(10000, '2026-10-03')]);
  assert.equal(month(both, '2026-11').expected, 52000);
});

check('string amounts, junk, zero and negative amounts', () => {
  const v = year(landlord(), [pay('25000.500', '2026-07-30'), pay('abc', '2026-07-30'), pay(null, '2026-07-30', null, { amount: null }), pay(0, '2026-07-30'), pay('-5', '2026-07-30'), pay('1,000', '2026-07-30'), pay(1500.25, '2026-07-31', null, { amount: 1500.25 })]);
  assert.equal(month(v, '2026-07').paid, 26500.75);
  assert.equal(month(v, '2026-07').shares.length, 2);
});

check('payments that do not count: drafts, voided, rows with no status, other contacts, the other direction', () => {
  const v = year(landlord(), [
    pay(1000, '2026-07-01', null, { status: 'DRAFT' }),
    pay(1000, '2026-07-02', null, { status: 'VOIDED' }),
    pay(1000, '2026-07-03', null, { status: undefined }),
    pay(1000, '2026-07-04', null, { contact_id: 'OTHER' }),
    pay(1000, '2026-07-05', null, { contact_id: undefined, contact: { id: 'OTHER' } }),
    pay(300, '2026-07-06', null, { status: 'RECONCILED' }),
    pay(7, '2026-07-07', null, { kind: 'REVENUE' }),
    pay(5, '2026-07-08', null, { tx_date: 'not a date' }),
  ], { kind: 'EXPENSE' });
  assert.equal(month(v, '2026-07').paid, 300);
  assert.equal(year(landlord(), [pay(7, '2026-07-07', null, { kind: 'REVENUE' })]).months[6].paid, 7, 'without a kind filter every direction counts');
});

check('a payment dated by timestamp is read by its calendar day', () => {
  const v = year(landlord(), [pay(900, '2026-07-31T23:30:00+00:00')]);
  assert.equal(month(v, '2026-07').paid, 900);
});

// ---------------------------------------------------------------- which month a payment belongs to

check('a named month wins over the payment date', () => {
  const v = year(landlord(), [pay(1000, '2026-10-02', 'سداد إيجار شهر سبتمبر 2026')]);
  assert.equal(month(v, '2026-09').paid, 1000);
  assert.equal(month(v, '2026-10').paid, 0);
});

check('the year rule agrees with landlordPaymentMonthKey: December paid in January is last year, January paid in November is next year', () => {
  const dec = pay(1000, '2027-01-05', 'إيجار شهر ديسمبر');
  assert.equal(namedMonthKeys(dec)[0], '2026-12');
  const jan = pay(1000, '2026-11-20', 'إيجار شهر يناير');
  assert.equal(namedMonthKeys(jan)[0], '2027-01');
  const explicit = pay(1000, '2026-11-20', 'إيجار شهر يناير 2026');
  assert.equal(namedMonthKeys(explicit)[0], '2026-01');
  const y26 = year(landlord(), [dec, jan]);
  const y27 = buildObligationYear({ contact: landlord(), payments: [dec, jan], today: '2027-02-10', year: 2027 });
  assert.equal(month(y26, '2026-12').paid, 1000);
  assert.equal(month(y27, '2027-01').paid, 1000);
});

check('every month name agrees with landlordPaymentMonthKey wherever the payment is dated', () => {
  const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'اغسطس', 'سبتمبر', 'أكتوبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
  const dates = ['2026-01-02', '2026-03-31', '2026-06-15', '2026-07-01', '2026-09-30', '2026-12-31', '2027-01-01'];
  for (const name of names) {
    for (const date of dates) {
      for (const text of [`ايجار شهر ${name}`, `${name}`, `سداد ${name} 2026`, `دفعة ${name} 2025`]) {
        const tx = { description: text, tx_date: date };
        assert.deepEqual(namedMonthKeys(tx), [roles.landlordPaymentMonthKey(tx)], `${text} @ ${date}`);
      }
    }
  }
});

check('no month in the text, or a text that only holds a number: the month it was paid in', () => {
  for (const d of [null, '', 'سداد إيجار', 'دفعة رقم 7', 'تحويل مصرفي']) assert.deepEqual(namedMonthKeys({ description: d, tx_date: '2026-08-31' }), [], String(d));
  assert.deepEqual(namedMonthKeys({ description: 'إيجار 2026-05', tx_date: '2026-08-31' }), ['2026-05']);
  assert.deepEqual(namedMonthKeys({ description: 'إيجار 5/2026', tx_date: '2026-08-31' }), ['2026-05']);
});

check('one payment naming several months is split equally between them', () => {
  const v = year(landlord(), [pay(104000, '2026-08-01', 'إيجار يوليو وأغسطس 2026')]);
  assert.equal(month(v, '2026-07').paid, 52000);
  assert.equal(month(v, '2026-08').paid, 52000);
  assert.equal(month(v, '2026-07').shares[0].tx.id, month(v, '2026-08').shares[0].tx.id);
  assert.equal(month(v, '2026-07').shares[0].how, 'named');
  assert.deepEqual(namedMonthKeys({ description: 'إيجار يوليو و أغسطس و سبتمبر', tx_date: '2026-07-20' }), ['2026-07', '2026-08', '2026-09']);
});

check('a range of months names every month in it, across a year end too', () => {
  assert.deepEqual(namedMonthKeys({ description: 'إيجار من يوليو إلى سبتمبر 2026', tx_date: '2026-07-01' }), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(namedMonthKeys({ description: 'إيجار يوليو - سبتمبر', tx_date: '2026-07-01' }), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(namedMonthKeys({ description: 'إيجار نوفمبر الى فبراير', tx_date: '2026-11-05' }), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(namedMonthKeys({ description: 'إيجار ديسمبر 2026 ويناير 2027', tx_date: '2026-12-05' }), ['2026-12', '2027-01']);
  // a year after each month does not break the range
  assert.deepEqual(namedMonthKeys({ description: 'إيجار من يوليو 2026 إلى سبتمبر 2026', tx_date: '2026-09-10' }), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(namedMonthKeys({ description: 'إيجار نوفمبر 2026 حتى فبراير 2027', tx_date: '2026-11-05' }), ['2026-11', '2026-12', '2027-01', '2027-02']);
  // two months with only a year between them and no range word are still just those two
  assert.deepEqual(namedMonthKeys({ description: 'إيجار يوليو 2026 وسبتمبر 2026', tx_date: '2026-09-10' }), ['2026-07', '2026-09']);
});

check('a split amount is whole: no money lost to rounding', () => {
  const v = year(landlord(), [pay(100, '2026-08-01', 'إيجار يوليو وأغسطس وسبتمبر 2026')]);
  const sum = ['2026-07', '2026-08', '2026-09'].reduce((s, k) => s + month(v, k).paid, 0);
  assert.equal(sum, 100);
});

// ---------------------------------------------------------------- unnamed payments

check('with a rent, an unnamed late payment clears the oldest gap first', () => {
  const v = year(landlord({ monthly_rent: '1000', notes: '[since:2026-07]' }), [pay(1000, '2026-07-31'), pay(1000, '2026-09-30')]);
  assert.equal(month(v, '2026-07').status, 'paid');
  assert.equal(month(v, '2026-08').status, 'paid', 'the September payment went to August');
  assert.equal(month(v, '2026-08').shares[0].how, 'oldest_unpaid');
  assert.equal(month(v, '2026-09').status, 'due');
  assert.equal(month(v, '2026-09').overdue, true);
});

check('payment_month mode keeps every payment where it was paid (what the landlord dues do)', () => {
  const v = year(landlord({ monthly_rent: '1000', notes: '[since:2026-07]' }), [pay(1000, '2026-07-31'), pay(1000, '2026-09-30')], { unnamedPayments: 'payment_month' });
  assert.equal(month(v, '2026-08').status, 'due');
  assert.equal(month(v, '2026-09').status, 'paid');
});

check('with a rent, a surplus moves on to the following months (rent paid ahead)', () => {
  const v = year(landlord({ monthly_rent: '1000', notes: '[since:2026-07]' }), [pay(3000, '2026-07-10')]);
  assert.deepEqual([month(v, '2026-07').status, month(v, '2026-08').status, month(v, '2026-09').status, month(v, '2026-10').status], ['paid', 'paid', 'paid', 'due']);
  assert.deepEqual(month(v, '2026-08').shares.map((s) => s.how), ['spill']);
  assert.equal(month(v, '2026-07').overpaid, 0);
  const strict = year(landlord({ monthly_rent: '1000', notes: '[since:2026-07]' }), [pay(3000, '2026-07-10')], { unnamedPayments: 'payment_month' });
  assert.equal(month(strict, '2026-07').overpaid, 2000);
  assert.equal(month(strict, '2026-08').status, 'due');
});

check('with a rent, a surplus beyond the contract end stays in the last month', () => {
  const v = year(landlord({ monthly_rent: '1000', notes: '[since:2026-07]', contract_end: '2026-08-31' }), [pay(5000, '2026-08-10')]);
  assert.equal(month(v, '2026-07').paid, 1000);
  assert.equal(month(v, '2026-08').paid, 4000);
  assert.equal(month(v, '2026-09').status, 'idle');
  assert.equal(month(v, '2026-08').overpaid, 3000);
});

check('without a rent no month is ever "full", so unnamed payments stay where they were paid', () => {
  const v = year(landlord({ notes: '[since:2026-03]' }), [pay(1000, '2026-07-31'), pay(2000, '2026-08-31')]);
  assert.equal(month(v, '2026-03').status, 'due', 'March is not filled by July money');
  assert.equal(month(v, '2026-07').paid, 1000);
  assert.equal(month(v, '2026-08').paid, 2000);
});

check('a named payment is never moved by the oldest-gap rule', () => {
  const v = year(landlord({ monthly_rent: '1000', notes: '[since:2026-06]' }), [pay(1000, '2026-10-02', 'إيجار شهر أغسطس')]);
  assert.equal(month(v, '2026-08').paid, 1000);
  assert.equal(month(v, '2026-06').status, 'due');
  assert.equal(month(v, '2026-07').status, 'due');
});

check('an unnamed payment older than the tracking start stays in its own month', () => {
  const v = year(landlord({ monthly_rent: '1000', notes: '[since:2026-07]' }), [pay(1000, '2026-05-10')]);
  assert.equal(month(v, '2026-05').paid, 1000);
  assert.equal(month(v, '2026-07').status, 'due');
});

// ---------------------------------------------------------------- contract dates

check('months outside the contract are idle, and still show what was paid for them', () => {
  const v = year(landlord({ monthly_rent: '1000', notes: '[since:2026-05]', contract_start: '2026-03-15', contract_end: '2026-09-30' }), [pay(1000, '2026-10-05', 'إيجار أكتوبر')]);
  assert.deepEqual(statuses(v), ['idle', 'idle', 'before_system', 'before_system', 'due', 'due', 'due', 'due', 'due', 'idle', 'idle', 'idle']);
  assert.equal(month(v, '2026-01').idleReason, 'before_contract');
  assert.equal(month(v, '2026-01').label, 'قبل العقد');
  assert.equal(month(v, '2026-10').idleReason, 'after_contract');
  assert.equal(month(v, '2026-10').paid, 1000);
  assert.equal(month(v, '2026-10').label, 'بعد العقد');
  // the contract's start and end months count whole
  assert.equal(month(v, '2026-03').status, 'before_system');
  assert.equal(month(v, '2026-09').status, 'due');
});

check('a contract that ends before it starts is ignored, and says so', () => {
  const v = year(landlord({ monthly_rent: '1000', contract_start: '2026-09-01', contract_end: '2026-02-01', notes: '[since:2026-06]' }), []);
  assert.equal(v.contract.datesInvalid, true);
  assert.equal(month(v, '2026-06').status, 'due');
  assert.equal(month(v, '2026-12').status, 'upcoming');
});

// ---------------------------------------------------------------- windows

check('the last twelve months cross a year boundary', () => {
  const v = buildObligationLast12({ contact: landlord({ monthly_rent: '1000', notes: '[since:2026-11]' }), payments: [pay(1000, '2026-11-30'), pay(1000, '2026-12-31'), pay(1000, '2027-01-31')], today: '2027-02-10' });
  assert.equal(v.months.length, 12);
  assert.equal(v.months[0].monthKey, '2026-03');
  assert.equal(v.months[11].monthKey, '2027-02');
  assert.deepEqual(v.months.slice(8).map((m) => m.status), ['paid', 'paid', 'paid', 'due']);
  assert.equal(v.months[0].status, 'before_system');
  assert.equal(v.months[11].current, true);
});

check('year view: another year than the current one', () => {
  const past = buildObligationYear({ contact: landlord({ monthly_rent: '1000', notes: '[since:2025-10]' }), payments: [], today: TODAY, year: 2025 });
  assert.deepEqual(past.months.map((m) => m.status), [...rep(9, 'before_system'), ...rep(3, 'due')]);
  assert.ok(past.months.slice(9).every((m) => m.overdue));
  const next = buildObligationYear({ contact: landlord({ monthly_rent: '1000', notes: '[since:2025-10]' }), payments: [], today: TODAY, year: 2027 });
  assert.ok(next.months.every((m) => m.status === 'upcoming'));
  // arrears of earlier years still count in the totals of any view
  assert.equal(past.summary.owed.months, next.summary.owed.months);
  assert.equal(past.summary.owed.months, 13);
});

check('the year defaults to the current one', () => {
  const v = buildObligationYear({ contact: landlord(), payments: [], today: '2027-03-01', goLiveMonth: '2027-01' });
  assert.equal(v.months[0].monthKey, '2027-01');
});

check('addMonths carries over a year end', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-10', -11), '2025-11');
  assert.equal(addMonths('2026-10', 0), '2026-10');
});

// ---------------------------------------------------------------- aggregates and helpers

check('aggregate over many contacts', () => {
  const a = summarizeObligation({ contact: landlord(), payments: JULY_AUG, today: TODAY, goLiveMonth: '2026-06' });
  const b = summarizeObligation({ contact: landlord({ id: 'L2', monthly_rent: '1000', notes: '[since:2026-09]' }), payments: [], today: TODAY });
  const c = summarizeObligation({ contact: landlord({ id: 'L3', monthly_rent: '500', notes: '[since:2026-09]' }), payments: [pay(500, '2026-09-30', null, { contact_id: 'L3' }), pay(500, '2026-10-02', null, { contact_id: 'L3' })], today: TODAY });
  const g = aggregateObligations([a, b, c]);
  assert.equal(g.contacts, 3);
  assert.equal(g.contactsOwing, 2);
  assert.equal(g.dueMonths, 4);
  assert.equal(g.overdueMonths, 2);
  assert.equal(g.amount, 104000 + 2000);
  assert.equal(g.estimated, true);
  assert.equal(g.amountComplete, true);
  assert.equal(g.settledBeforeSystem, 6 + 8 + 8);
  assert.deepEqual(aggregateObligations([]), { contacts: 0, contactsOwing: 0, dueMonths: 0, overdueMonths: 0, amount: 0, amountComplete: true, estimated: false, settledBeforeSystem: 0 });
  const unknown = aggregateObligations([summarizeObligation({ contact: landlord(), payments: [], today: TODAY, goLiveMonth: '2026-09' })]);
  assert.equal(unknown.amountComplete, false);
});

check('go-live month: the earliest contact, by local day', () => {
  assert.equal(goLiveMonthOf([{ created_at: '2026-07-10T09:00:00Z' }, { created_at: '2026-06-01T10:00:00Z' }, { created_at: null }, { created_at: 'junk' }]), '2026-06');
  assert.equal(goLiveMonthOf([]), null);
  assert.equal(goLiveMonthOf([{ created_at: null }]), null);
});

check('payments grouped by contact', () => {
  const rows = [pay(1, '2026-07-01', null, { contact_id: 'A' }), pay(2, '2026-07-01', null, { contact_id: undefined, contact: { id: 'B' } }), pay(3, '2026-07-01', null, { contact_id: 'A' }), pay(4, '2026-07-01', null, { contact_id: undefined })];
  const g = groupPaymentsByContact(rows);
  assert.equal(g.get('A').length, 2);
  assert.equal(g.get('B').length, 1);
  assert.equal(g.size, 2);
});

check('Arabic counts agree', () => {
  assert.equal(obligationMonthsText(1), 'شهر واحد');
  assert.equal(obligationMonthsText(2), 'شهران');
  assert.equal(obligationMonthsText(5), '5 أشهر');
  assert.equal(obligationMonthsText(11), '11 شهراً');
});

check('nothing it was given is changed', () => {
  const payments = JULY_AUG.map((p) => ({ ...p }));
  const contact = Object.freeze(landlord());
  const frozen = Object.freeze(payments.map((p) => Object.freeze(p)));
  year(contact, frozen, { goLiveMonth: '2026-06' });
  assert.deepEqual(payments, JULY_AUG);
});

console.log(`\n✓ verify-obligation-months: ${passed} checks passed`);
