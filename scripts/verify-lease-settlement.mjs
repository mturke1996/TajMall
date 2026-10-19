/**
 * The closing statement of a lease: arrears from the tenant's rent account, the deposit the books hold
 * (counted revenue minus expense in LIA-DEP, compared with the contract), the net in one sentence, the
 * refund the dialog is opened with, and the warnings. A source that could not be read is never zero.
 *   npx tsx scripts/verify-lease-settlement.mjs
 */
import assert from 'node:assert/strict';

const { buildSettlement, buildRefundPrefill, depositAccountState, planEnd, DEPOSIT_CODE } = await import('../src/lib/lease-settlement.ts');
const { buildTenantRentAccount } = await import('../src/lib/tenant-rent-account.ts');
const { formatMoney } = await import('../src/lib/utils.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-19';
const money = (n) => formatMoney(n, 'LYD');

// ── fixtures ────────────────────────────────────────────────────────────────
const month = (m, kind, remaining, o = {}) => ({
  month: m,
  kind,
  paid: o.paid ?? 0,
  remaining,
  owedNow: o.owedNow ?? (m <= TODAY.slice(0, 7) ? remaining : 0),
  chargeId: o.chargeId === undefined ? `c-${m}` : o.chargeId,
});
const rent = (months, charges = []) => ({ years: [{ months }], charges });
const noRent = rent([]);
const tx = (id, kind, amount, o = {}) => ({
  id,
  kind,
  amount,
  status: o.status ?? 'POSTED',
  tx_date: o.date ?? '2026-01-05',
  category: { code: o.code ?? 'LIA-DEP' },
});
const deposit = (amount, o = {}) => tx(`d${amount}-${o.date ?? ''}`, 'REVENUE', amount, o);
const refund = (amount, o = {}) => tx(`r${amount}-${o.date ?? ''}`, 'EXPENSE', amount, o);
const lease = (id, dep, o = {}) => ({ id, status: o.status ?? 'ACTIVE', deposit_amount: dep, unit: { unit_number: o.unit ?? '12' } });
const base = { today: TODAY, contract: { id: 'L1', endDate: '2027-01-20' }, leases: [lease('L1', 3000)], rent: noRent, transactions: [] };
const settle = (o = {}) => buildSettlement({ ...base, ...o });
const keys = (s) => s.notes.map((n) => n.key);
const note = (s, key) => s.notes.find((n) => n.key === key);
const twoMonthsOwed = rent([month('2026-09', 'due', 900), month('2026-10', 'due', 900)]);

// ── the net and its sentence ────────────────────────────────────────────────
check('nothing owed and no deposit: nothing due to either side', () => {
  const s = settle({ leases: [lease('L1', 0)] });
  assert.equal(s.complete, true);
  assert.equal(s.net, 0);
  assert.equal(s.verdict.kind, 'even');
  assert.equal(s.verdict.sentence, 'لا شيء مستحق للطرفين');
  assert.equal(s.arrears.total, 0);
  assert.equal(s.deposit.state, 'none');
  assert.equal(s.refund.available, false);
  assert.equal(s.refund.reason, 'no_deposit');
});

check('deposit held and no arrears: all of it goes back', () => {
  const s = settle({ transactions: [deposit(3000)] });
  assert.equal(s.deposit.held, 3000);
  assert.equal(s.net, 3000);
  assert.equal(s.verdict.kind, 'refund');
  assert.equal(s.verdict.sentence, `يُرَد للمستأجر ${money(3000)}`);
  assert.equal(s.deposit.state, 'agree');
  assert.deepEqual(s.refund, { available: true, amount: 3000, full: 3000, offset: 0 });
});

check('arrears below the deposit: the rest goes back, the rest stays against the arrears', () => {
  const s = settle({ transactions: [deposit(3000)], rent: twoMonthsOwed });
  assert.equal(s.arrears.total, 1800);
  assert.equal(s.net, 1200);
  assert.equal(s.verdict.sentence, `يُرَد للمستأجر ${money(1200)}`);
  assert.equal(s.verdict.detail, `التأمين ${money(3000)} والمتأخرات ${money(1800)}.`);
  assert.deepEqual(s.refund, { available: true, amount: 1200, full: 3000, offset: 1800 });
});

check('arrears above the deposit: the tenant still owes the difference and nothing is handed back', () => {
  const s = settle({ transactions: [deposit(1000)], rent: twoMonthsOwed });
  assert.equal(s.net, -800);
  assert.equal(s.verdict.kind, 'owed');
  assert.equal(s.verdict.amount, 800);
  assert.equal(s.verdict.sentence, `يبقى على المستأجر ${money(800)}`);
  assert.equal(s.refund.available, false);
  assert.equal(s.refund.reason, 'covered_by_arrears');
});

check('arrears equal to the deposit: even, and the deposit is kept against them', () => {
  const s = settle({ transactions: [deposit(1800)], rent: twoMonthsOwed });
  assert.equal(s.net, 0);
  assert.equal(s.verdict.kind, 'even');
  assert.equal(s.refund.reason, 'covered_by_arrears');
});

check('arrears and no deposit: the tenant owes them all', () => {
  const s = settle({ leases: [lease('L1', 0)], rent: twoMonthsOwed });
  assert.equal(s.verdict.sentence, `يبقى على المستأجر ${money(1800)}`);
  assert.equal(s.verdict.detail, `لا تأمين محتجزاً، والمتأخرات ${money(1800)}.`);
});

check('the sentence never carries a typed sign next to an amount', () => {
  for (const s of [settle({ transactions: [deposit(3000)] }), settle({ transactions: [deposit(100)], rent: twoMonthsOwed })]) {
    assert.ok(!/[+−-]/.test(s.verdict.sentence.replace(/[⁦⁩]/g, '')), s.verdict.sentence);
  }
});

check('float noise does not turn an even settlement into a refund of a fraction', () => {
  const s = settle({
    transactions: [deposit(0.3)],
    leases: [lease('L1', 0.3)],
    rent: rent([month('2026-09', 'due', 0.1), month('2026-10', 'due', 0.2)]),
  });
  assert.equal(s.arrears.total, 0.3);
  assert.equal(s.net, 0);
  assert.equal(s.verdict.kind, 'even');
});

// ── arrears ─────────────────────────────────────────────────────────────────
check('arrears list the months owed now, oldest first, with what is still owed on a part-paid month', () => {
  const s = settle({
    rent: rent([
      month('2026-10', 'due', 1000),
      month('2026-08', 'partial', 600, { paid: 400 }),
      month('2026-09', 'uncharged', 1000, { chargeId: null }),
      month('2026-07', 'paid', 0, { paid: 1000 }),
      month('2026-11', 'upcoming', 1000),
    ]),
  });
  assert.deepEqual(s.arrears.rows.map((r) => r.key), ['rent-2026-08', 'rent-2026-09', 'rent-2026-10']);
  assert.deepEqual(s.arrears.rows.map((r) => r.amount), [600, 1000, 1000]);
  assert.equal(s.arrears.rows[0].sub, 'دُفع جزء منه، وهذا المتبقي');
  assert.equal(s.arrears.rows[1].sub, 'لم تُسجَّل مطالبته بعد');
  assert.equal(s.arrears.rows[2].sub, null);
  assert.match(s.arrears.rows[0].label, /أغسطس 2026/);
  assert.equal(s.arrears.total, 2600);
});

check('service, fine and other charges still open are arrears; paid ones and those due later are not', () => {
  const s = settle({
    rent: rent([], [
      { id: 'a', type: 'SERVICE', description: 'خدمات أكتوبر', due_date: '2026-10-01', amount: '300', total_paid: '0', status: 'UNPAID' },
      { id: 'b', type: 'FINE', description: 'غرامة تأخير', due_date: '2026-09-10', amount: '200', total_paid: '50', status: 'PARTIAL' },
      { id: 'c', type: 'OTHER', description: 'مدفوعة', due_date: '2026-08-01', amount: '100', total_paid: '100', status: 'PAID' },
      { id: 'd', type: 'SERVICE', description: 'خدمات نوفمبر', due_date: '2026-11-01', amount: '300', total_paid: '0', status: 'UNPAID' },
      { id: 'e', type: 'RENT', description: 'إيجار', due_date: '2026-10-01', amount: '900', total_paid: '0', status: 'UNPAID' },
    ]),
  });
  assert.deepEqual(s.arrears.rows.map((r) => r.key), ['charge-b', 'charge-a']);
  assert.equal(s.arrears.other, 450);
  assert.equal(s.arrears.rent, 0);
  assert.equal(s.arrears.total, 450);
  assert.match(s.arrears.rows[0].sub, /دُفع جزء منها/);
  assert.ok(keys(s).includes('after_end'));
  assert.match(note(s, 'after_end').text, /رسوم أخرى/);
});

check('a charge due today is owed today', () => {
  const s = settle({
    rent: rent([], [{ id: 'a', type: 'SERVICE', description: 'خدمات', due_date: TODAY, amount: 100, total_paid: 0, status: 'UNPAID' }]),
  });
  assert.equal(s.arrears.other, 100);
  assert.ok(!keys(s).includes('after_end'));
});

check('the figures follow the real rent account: owed now and the months with no charge', () => {
  const m = (mo, status, amount, paid, charge) => ({ month: mo, status, amount, paid, charge_id: charge ? `c${mo}` : null, description: null });
  const months = [
    ...['01', '02', '03', '04', '05', '06'].map((n) => m(`2026-${n}`, 'paid', 1000, 1000, true)),
    m('2026-07', 'partial', 1000, 400, true),
    m('2026-08', 'unpaid', 1000, 0, true),
    m('2026-09', 'no_charge', 1000, 0, false),
    m('2026-10', 'unpaid', 1000, 0, true),
    m('2026-11', 'unpaid', 1000, 0, true),
    m('2026-12', 'no_charge', 1000, 0, false),
  ];
  const account = buildTenantRentAccount({
    calendars: [{ year: 2026, tenant_id: 't1', monthly_rent: 1000, contract_id: null, months }],
    pricing: { bands: [], leaseRent: 1000, contactRent: 1000 },
    claimStart: '2026-01-01',
    now: '2026-10',
  });
  assert.equal(account.owedNow, 3600);
  const s = settle({ rent: { years: account.years, charges: [] } });
  assert.equal(s.arrears.rent, account.owedNow);
  assert.deepEqual(s.arrears.rows.map((r) => r.key.slice(5)), account.owingMonths);
  const unch = note(s, 'uncharged');
  assert.ok(unch && unch.tone === 'warning');
  assert.ok(unch.text.includes(money(account.owedUncharged)), unch.text);
  // November already has a charge and is still unpaid: it stays claimed after the lease ends
  assert.match(note(s, 'after_end').text, /شهر واحد من الإيجار/);
  assert.ok(note(s, 'after_end').text.includes(money(1000)));
  assert.equal(s.net, -3600);
});

// ── the deposit ─────────────────────────────────────────────────────────────
check('only counted transactions make the deposit: posted and reconciled, not drafts or voided', () => {
  const s = settle({
    transactions: [
      deposit(1000, { status: 'POSTED' }),
      deposit(500, { status: 'RECONCILED', date: '2026-02-01' }),
      deposit(900, { status: 'DRAFT', date: '2026-03-01' }),
      deposit(700, { status: 'VOIDED', date: '2026-04-01' }),
      refund(300, { status: 'VOIDED' }),
    ],
    leases: [lease('L1', 1500)],
  });
  assert.equal(s.deposit.received, 1500);
  assert.equal(s.deposit.refunded, 0);
  assert.equal(s.deposit.held, 1500);
  assert.equal(s.deposit.state, 'agree');
});

check('money in other accounts is not the deposit', () => {
  const s = settle({ transactions: [tx('r', 'REVENUE', 5000, { code: 'REV-RNT' }), tx('e', 'EXPENSE', 200, { code: 'EXP-ELC' })], leases: [lease('L1', 0)] });
  assert.equal(s.deposit.received, 0);
  assert.equal(s.deposit.held, 0);
});

check('a refund already made lowers what is held, and the contract still agrees with what was received', () => {
  const s = settle({ transactions: [deposit(3000), refund(1000, { date: '2026-06-01' })] });
  assert.equal(s.deposit.refunded, 1000);
  assert.equal(s.deposit.held, 2000);
  assert.equal(s.deposit.state, 'agree');
  assert.equal(s.refund.full, 2000);
  assert.ok(!keys(s).includes('deposit_mismatch'));
});

check('a deposit refunded in full leaves nothing to hand back', () => {
  const s = settle({ transactions: [deposit(3000), refund(3000, { date: '2026-06-01' })] });
  assert.equal(s.deposit.held, 0);
  assert.equal(s.deposit.state, 'agree');
  assert.equal(s.refund.reason, 'refunded');
});

check('the contract and the books disagree: the net follows the books and the difference is shown', () => {
  const s = settle({ transactions: [deposit(3000)], leases: [lease('L1', 5000)] });
  assert.equal(s.deposit.state, 'mismatch');
  assert.equal(s.deposit.held, 3000);
  assert.equal(s.net, 3000);
  const n = note(s, 'deposit_mismatch');
  assert.equal(n.tone, 'warning');
  assert.ok(n.text.includes(money(5000)) && n.text.includes(money(3000)), n.text);
});

check('the books hold a deposit the contract does not name: still shown, and the net uses the books', () => {
  const s = settle({ transactions: [deposit(800)], leases: [lease('L1', 0)] });
  assert.equal(s.deposit.state, 'mismatch');
  assert.equal(s.net, 800);
  assert.match(note(s, 'deposit_mismatch').text, /العقد لا يذكر تأميناً/);
});

check('a renewal that carries the old deposit is not a disagreement', () => {
  const s = settle({
    transactions: [deposit(3000)],
    contract: { id: 'L2', endDate: '2027-01-20' },
    leases: [lease('L1', 3000, { status: 'EXPIRED' }), lease('L2', 0)],
  });
  assert.equal(s.deposit.state, 'agree');
  assert.ok(!keys(s).includes('deposit_mismatch'));
});

check('a deposit named in the contract but never received in the books is not counted or refunded', () => {
  const s = settle({ transactions: [], leases: [lease('L1', 2000)], rent: twoMonthsOwed });
  assert.equal(s.deposit.state, 'unrecorded');
  assert.equal(s.deposit.held, 0);
  assert.equal(s.net, -1800);
  assert.equal(s.refund.available, false);
  assert.equal(s.refund.reason, 'no_deposit');
  assert.ok(note(s, 'deposit_unrecorded').text.includes(money(2000)));
});

check('more handed back than received is flagged and holds nothing', () => {
  const s = settle({ transactions: [deposit(1000), refund(1500, { date: '2026-06-01' })], leases: [lease('L1', 1000)] });
  assert.equal(s.deposit.state, 'over_refunded');
  assert.equal(s.deposit.held, 0);
  assert.ok(keys(s).includes('deposit_over_refunded'));
  assert.equal(s.refund.available, false);
});

check('a refund saved as a draft is not counted but is called out', () => {
  const s = settle({ transactions: [deposit(3000), refund(1000, { status: 'DRAFT', date: '2026-10-01' })] });
  assert.equal(s.deposit.held, 3000);
  assert.equal(s.deposit.pendingRefund, 1000);
  assert.ok(note(s, 'pending_refund').text.includes(money(1000)));
});

// ── sources that could not be read ──────────────────────────────────────────
check('an unreadable rent account gives no net and no arrears, never zero', () => {
  const s = settle({ rent: null, transactions: [deposit(3000)] });
  assert.equal(s.complete, false);
  assert.deepEqual(s.unavailable, ['rent']);
  assert.equal(s.arrears, null);
  assert.equal(s.net, null);
  assert.equal(s.verdict.kind, 'unknown');
  assert.equal(s.verdict.sentence, 'تعذّر حساب الصافي');
  assert.match(s.verdict.detail, /مطالبات المستأجر/);
  assert.equal(s.refund.available, false);
  assert.equal(s.refund.reason, 'incomplete');
});

check('unreadable transactions give no deposit and no net', () => {
  const s = settle({ transactions: null });
  assert.deepEqual(s.unavailable, ['transactions']);
  assert.equal(s.deposit, null);
  assert.equal(s.net, null);
  assert.equal(s.lastPayment, null);
  assert.match(s.verdict.detail, /معاملات المستأجر/);
});

check('unreadable leases give no net', () => {
  const s = settle({ leases: null });
  assert.deepEqual(s.unavailable, ['contracts']);
  assert.equal(s.net, null);
});

check('everything unreadable names every part', () => {
  const s = settle({ rent: null, transactions: null, leases: null });
  assert.deepEqual(s.unavailable, ['rent', 'transactions', 'contracts']);
  for (const part of ['مطالبات المستأجر', 'معاملات المستأجر', 'عقود المستأجر']) assert.ok(s.verdict.detail.includes(part), part);
  assert.equal(s.refund.available, false);
  // the end date is still known: it needs none of them
  assert.equal(s.endPlan.newEnd, TODAY);
});

// ── after the end date ──────────────────────────────────────────────────────
check('months after the end date that stay claimed are called out and do not change the net', () => {
  const s = settle({
    transactions: [deposit(3000)],
    rent: rent([month('2026-11', 'upcoming', 1000), month('2026-12', 'upcoming', 1000), month('2027-01', 'upcoming', 1000, { chargeId: null })]),
  });
  assert.equal(s.net, 3000);
  const n = note(s, 'after_end');
  assert.equal(n.tone, 'warning');
  assert.ok(n.text.startsWith('يبقى مطلوباً من المستأجر بعد تاريخ الإنهاء'), n.text);
  assert.ok(n.text.includes('شهرين') && n.text.includes(money(2000)), n.text);
});

check('a part-paid month after the end date is still claimed for what is left', () => {
  const s = settle({ rent: rent([month('2026-11', 'partial', 400, { paid: 600 })]) });
  assert.ok(note(s, 'after_end').text.includes(money(400)));
});

check('rent paid ahead for months after the end date is called out apart from the net', () => {
  const s = settle({ rent: rent([month('2026-11', 'partial', 0, { paid: 1000 }), month('2026-12', 'paid', 0, { paid: 1000 })]), transactions: [deposit(500)], leases: [lease('L1', 500)] });
  assert.equal(s.net, 500);
  const n = note(s, 'prepaid');
  assert.ok(n.text.includes('شهرين') && n.text.includes(money(2000)), n.text);
  assert.ok(!keys(s).includes('after_end'));
});

check('nothing is said about later months when there are none', () => {
  const s = settle({ rent: rent([month('2026-10', 'due', 900)]) });
  assert.ok(!keys(s).includes('after_end') && !keys(s).includes('prepaid'));
});

check('the current month is owed, not "after the end date"', () => {
  const s = settle({ rent: rent([month('2026-10', 'partial', 400, { paid: 600 })]) });
  assert.equal(s.arrears.total, 400);
  assert.ok(!keys(s).includes('after_end'));
});

// ── other notes ─────────────────────────────────────────────────────────────
check('rent received but linked to no month warns that the arrears may be too high', () => {
  const s = settle({ rent: twoMonthsOwed, unlinkedReceipts: { total: 900, count: 1 } });
  assert.ok(note(s, 'unlinked').text.includes(money(900)));
  assert.ok(note(s, 'unlinked').text.includes('دفعة واحدة'));
  assert.ok(!keys(settle({ unlinkedReceipts: { total: 0, count: 0 } })).includes('unlinked'));
  assert.ok(!keys(settle({})).includes('unlinked_unchecked'));
});

check('an unreadable check for unlinked rent is said, not skipped', () => {
  const n = note(settle({ unlinkedReceipts: null }), 'unlinked_unchecked');
  assert.equal(n.tone, 'info');
});

check('another active lease of the tenant is called out, and the refund stops at this lease\'s deposit', () => {
  const s = settle({
    transactions: [deposit(3000), deposit(2000, { date: '2026-03-01' })],
    leases: [lease('L1', 3000), lease('L2', 2000, { unit: '7' })],
  });
  assert.equal(s.deposit.held, 5000);
  assert.ok(note(s, 'other_leases').text.includes('محل 7'));
  assert.equal(s.refund.full, 3000);
  assert.equal(s.refund.amount, 3000);
  // an ended lease of the same tenant is not "another active lease"
  assert.ok(!keys(settle({ leases: [lease('L1', 3000), lease('L0', 0, { status: 'TERMINATED' })] })).includes('other_leases'));
});

check('the last rent payment is the newest counted rent receipt', () => {
  const s = settle({
    transactions: [
      tx('a', 'REVENUE', 900, { code: 'REV-RNT', date: '2026-08-03' }),
      tx('b', 'REVENUE', 1200, { code: 'REV-RNT', date: '2026-10-03' }),
      tx('c', 'REVENUE', 5000, { code: 'REV-RNT', date: '2026-10-15', status: 'VOIDED' }),
      tx('d', 'REVENUE', 300, { code: 'REV-SRV', date: '2026-09-20' }),
      tx('e', 'EXPENSE', 400, { code: 'EXP-ELC', date: '2026-10-18' }),
      deposit(3000, { date: '2026-10-17' }),
    ],
    leases: [lease('L1', 3000)],
  });
  assert.deepEqual(s.lastPayment, { date: '2026-10-03', amount: 1200, daysAgo: 16 });
  const n = note(s, 'last_payment');
  assert.equal(n.tone, 'info');
  assert.ok(n.text.includes(money(1200)) && n.text.includes('16 يوماً'), n.text);
});

check('a rent payment today says so, and no payment at all says so', () => {
  assert.match(note(settle({ transactions: [tx('a', 'REVENUE', 100, { code: 'REV-RNT', date: TODAY })], leases: [lease('L1', 0)] }), 'last_payment').text, /\(اليوم\)/);
  const none = settle({ transactions: [], leases: [lease('L1', 0)] });
  assert.equal(none.lastPayment, null);
  assert.equal(note(none, 'last_payment').text, 'لا توجد دفعة إيجار مسجَّلة لهذا المستأجر.');
});

check('notes come in a fixed order: faults that change the net first, context last', () => {
  const s = settle({
    transactions: [deposit(3000), tx('p', 'REVENUE', 900, { code: 'REV-RNT', date: '2026-10-03' })],
    leases: [lease('L1', 5000), lease('L2', 0, { unit: '9' })],
    rent: rent([month('2026-09', 'uncharged', 1000, { chargeId: null }), month('2026-11', 'upcoming', 1000)]),
    unlinkedReceipts: { total: 100, count: 1 },
  });
  assert.deepEqual(keys(s), ['deposit_mismatch', 'unlinked', 'uncharged', 'after_end', 'other_leases', 'last_payment']);
});

// ── end date ────────────────────────────────────────────────────────────────
check('ending a lease early, on its last day, and after it has run out each say what is recorded', () => {
  const early = planEnd(TODAY, '2027-01-20');
  assert.equal(early.relation, 'early');
  assert.equal(early.daysToEnd, 93);
  assert.equal(early.newEnd, TODAY);
  assert.match(early.text, /قبل نهاية العقد المسجَّلة 20 يناير 2027 بـ 93 يوماً/);
  assert.equal(planEnd(TODAY, TODAY).relation, 'today');
  const late = planEnd(TODAY, '2026-10-09');
  assert.equal(late.relation, 'passed');
  assert.equal(late.daysToEnd, -10);
  assert.match(late.text, /منذ 10 أيام وما زال نشطاً/);
  assert.match(planEnd(TODAY, '2026-10-18').text, /منذ يوم واحد/);
  const unknown = planEnd(TODAY, '');
  assert.equal(unknown.relation, 'unknown');
  assert.equal(unknown.daysToEnd, null);
});

// ── the refund the dialog is opened with ────────────────────────────────────
const prefillBase = { amount: 1200, cap: 3000, tenantId: 't1', tenantName: 'سامي أحمد', unitNumber: '12', categoryId: 'cat-dep' };

check('the refund is an expense in the deposit account for the tenant, with the amount and a description', () => {
  const p = buildRefundPrefill(prefillBase);
  assert.deepEqual(p, {
    kind: 'EXPENSE',
    contactId: 't1',
    contactKind: 'TENANT',
    categoryId: 'cat-dep',
    amount: 1200,
    description: 'رد تأمين المستأجر سامي أحمد — محل 12',
  });
  assert.equal(DEPOSIT_CODE, 'LIA-DEP');
});

check('the refund amount is capped at the deposit still held and rounded to dinars and thousandths', () => {
  assert.equal(buildRefundPrefill({ ...prefillBase, amount: 9000 }).amount, 3000);
  assert.equal(buildRefundPrefill({ ...prefillBase, amount: 1249.5500000000002 }).amount, 1249.55);
});

check('the description says when the arrears were kept back, and leaves out a missing shop', () => {
  assert.match(buildRefundPrefill({ ...prefillBase, afterArrears: true }).description, /\(بعد خصم المتأخرات\)$/);
  assert.equal(buildRefundPrefill({ ...prefillBase, unitNumber: null }).description, 'رد تأمين المستأجر سامي أحمد');
});

check('no prefill is built for nothing to refund, no account or no tenant', () => {
  assert.equal(buildRefundPrefill({ ...prefillBase, amount: 0 }), null);
  assert.equal(buildRefundPrefill({ ...prefillBase, amount: -5 }), null);
  assert.equal(buildRefundPrefill({ ...prefillBase, cap: 0 }), null);
  assert.equal(buildRefundPrefill({ ...prefillBase, categoryId: null }), null);
  assert.equal(buildRefundPrefill({ ...prefillBase, tenantId: '' }), null);
});

check('the deposit account is ready only when it exists, is active and the dialog will list it', () => {
  assert.deepEqual(depositAccountState([{ id: 'x', code: 'REV-RNT', kind: 'REVENUE' }, { id: 'cat-dep', code: 'LIA-DEP', kind: 'EXPENSE', active: true }]), { state: 'ready', id: 'cat-dep' });
  // a liability account is stored with the kind ADJUSTMENT, which the dialog's expense list leaves out
  assert.deepEqual(depositAccountState([{ id: 'cat-dep', code: 'LIA-DEP', kind: 'ADJUSTMENT', active: true }]), { state: 'hidden_in_dialog', id: 'cat-dep' });
  assert.deepEqual(depositAccountState([{ id: 'cat-dep', code: 'LIA-DEP', kind: 'EXPENSE', active: false }]), { state: 'missing' });
  assert.deepEqual(depositAccountState([{ id: 'x', code: 'REV-RNT', kind: 'REVENUE' }]), { state: 'missing' });
  assert.deepEqual(depositAccountState(undefined), { state: 'missing' });
  assert.deepEqual(depositAccountState([]), { state: 'missing' });
});

console.log(`\n✓ verify-lease-settlement: ${passed} checks passed`);
