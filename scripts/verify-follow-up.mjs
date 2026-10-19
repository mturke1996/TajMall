/**
 * The dashboard's "needs follow-up" list: what is counted, in what order, and that a source that could not
 * be read is reported as unavailable instead of looking like nothing to do. Includes the monthly billing
 * row: an incomplete recent month, its tone by day, and the month it names.
 *   npx tsx scripts/verify-follow-up.mjs
 */
import assert from 'node:assert/strict';

const { buildFollowUp, landlordFollowUpTitle, landlordFollowUpDetail } = await import('../src/lib/follow-up.ts');
const { buildLandlordDues, landlordDuesAttention, LANDLORD_DUES_HREF } = await import('../src/lib/landlord-dues.ts');
const { buildContractExpiry } = await import('../src/lib/contract-expiry.ts');
const { addDaysISO } = await import('../src/lib/mall-dates.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-18';
const day = (o) => addDaysISO(TODAY, o);
const lease = (id, end, rent = 1000) => ({ id, unit_id: `u${id}`, tenant_id: `t${id}`, status: 'ACTIVE', start_date: day(-400), end_date: end, monthly_rent: String(rent), tenant: { id: `t${id}`, name: `م${id}`, phone: null }, unit: { id: `u${id}`, unit_number: String(id), floor: 'الأرضي' } });
const expiry = (leases) => buildContractExpiry({ contracts: leases, today: TODAY });
const rentRow = (status, amount, paid) => ({ current_month_status: status, current_month_amount: amount, current_month_paid: paid, monthly_rent: amount });
const quiet = { today: TODAY, aging: [], expiry: expiry([]), rent: [], pendingVouchers: 0, longVacant: 0 };
const keys = (f) => f.items.map((i) => i.key);

check('nothing to do: no items and nothing unavailable', () => {
  const f = buildFollowUp(quiet);
  assert.deepEqual(f.items, []);
  assert.deepEqual(f.unavailable, []);
});

check('expired and ending-within-30 leases are counted separately, with the rent that depends on them', () => {
  const f = buildFollowUp({ ...quiet, expiry: expiry([lease(1, day(-3), 2500), lease(2, day(-40), 500), lease(3, day(10), 1200), lease(4, day(31), 900), lease(5, day(400), 700)]) });
  const expired = f.items.find((i) => i.key === 'expired');
  const ending = f.items.find((i) => i.key === 'ending30');
  assert.equal(expired.count, 2);
  assert.equal(expired.amount, 3000);
  assert.equal(ending.count, 1);
  assert.equal(ending.amount, 1200);
  assert.equal(expired.tone, 'bad');
  assert.equal(ending.tone, 'warn');
  assert.equal(expired.href, '/mall?tab=contracts');
});

check('a lease ending in 31 to 90 days is not a follow-up item yet', () => {
  assert.deepEqual(keys(buildFollowUp({ ...quiet, expiry: expiry([lease(1, day(31)), lease(2, day(90))]) })), []);
});

check('arrears over 60 days count tenants and the amount in that last bucket only', () => {
  const f = buildFollowUp({
    ...quiet,
    aging: [
      { total_outstanding: 9000, bucket_90_plus: 4000 },
      { total_outstanding: 2500, bucket_90_plus: 0 },
      { total_outstanding: '1500.5', bucket_90_plus: '1500.5' },
      { total_outstanding: 700, bucket_90_plus: null },
    ],
  });
  const item = f.items.find((i) => i.key === 'arrears60');
  assert.equal(item.count, 2);
  assert.equal(item.amount, 5500.5);
  assert.equal(item.tone, 'bad');
  assert.equal(item.href, '/reports/ar-aging');
});

check('arrears all under 60 days produce no item', () => {
  assert.deepEqual(keys(buildFollowUp({ ...quiet, aging: [{ total_outstanding: 5000, bucket_90_plus: 0 }] })), []);
});

check('rent still owed: unpaid and part-paid count, paid, exempt and no-rent do not', () => {
  const f = buildFollowUp({
    ...quiet,
    rent: [rentRow('paid_full', 2000, 2000), rentRow('paid_partial', 2000, 500), rentRow('unpaid', 3000, 0), rentRow('exempt', 0, 0), rentRow('no_rent_set', null, 0)],
  });
  const item = f.items.find((i) => i.key === 'rent');
  assert.equal(item.count, 2);
  assert.equal(item.amount, 4500);
});

check('overpaid rent never offsets what others owe', () => {
  const f = buildFollowUp({ ...quiet, rent: [rentRow('paid_full', 1000, 1800), rentRow('unpaid', 1000, 0)] });
  assert.equal(f.items.find((i) => i.key === 'rent').amount, 1000);
});

check('rent owed is a reminder in the first days of the month and a warning from the 10th', () => {
  const rent = [rentRow('unpaid', 1000, 0)];
  assert.equal(buildFollowUp({ ...quiet, today: '2026-10-03', rent }).items[0].tone, 'neutral');
  assert.equal(buildFollowUp({ ...quiet, today: '2026-10-09', rent }).items[0].tone, 'neutral');
  assert.equal(buildFollowUp({ ...quiet, today: '2026-10-10', rent }).items[0].tone, 'warn');
});

check('vouchers: counted when the user approves them, silent when it does not apply', () => {
  assert.equal(buildFollowUp({ ...quiet, pendingVouchers: 3 }).items[0].count, 3);
  const none = buildFollowUp({ ...quiet, pendingVouchers: undefined });
  assert.deepEqual(none.items, []);
  assert.deepEqual(none.unavailable, []);
});

check('long-vacant shops are listed last, neutral', () => {
  const f = buildFollowUp({ ...quiet, longVacant: 2 });
  assert.equal(f.items[0].key, 'vacant');
  assert.equal(f.items[0].tone, 'neutral');
  assert.equal(f.items[0].count, 2);
});

check('items come most urgent first, and keep their order within a tone', () => {
  const f = buildFollowUp({
    today: '2026-10-20',
    aging: [{ bucket_90_plus: 100 }],
    expiry: expiry([lease(1, day(-1)), lease(2, day(5))]),
    rent: [rentRow('unpaid', 500, 0)],
    pendingVouchers: 1,
    longVacant: 1,
  });
  assert.deepEqual(keys(f), ['expired', 'arrears60', 'ending30', 'vouchers', 'rent', 'vacant']);
  assert.deepEqual(f.items.map((i) => i.tone), ['bad', 'bad', 'warn', 'warn', 'warn', 'neutral']);
});

check('a source that could not be read is unavailable, never an empty list', () => {
  const f = buildFollowUp({ today: TODAY, aging: null, expiry: null, rent: null, pendingVouchers: null, longVacant: null });
  assert.deepEqual(f.items, []);
  assert.deepEqual([...f.unavailable].sort(), ['arrears60', 'ending30', 'expired', 'rent', 'vacant', 'vouchers']);
});

check('one failed source does not hide the others', () => {
  const f = buildFollowUp({ ...quiet, aging: null, longVacant: 4 });
  assert.deepEqual(keys(f), ['vacant']);
  assert.deepEqual(f.unavailable, ['arrears60']);
});

check('junk numbers in a row count as zero', () => {
  const f = buildFollowUp({ ...quiet, aging: [{ bucket_90_plus: 'abc' }, { bucket_90_plus: undefined }], rent: [rentRow('unpaid', 'x', 'y')] });
  assert.deepEqual(f.items, []);
});

// billing: completeness of the current month and the two before it, oldest first (as buildBillingPreview returns it)
const bm = (month, total, missing, missingAmount = missing * 1000) => ({ month, total, generated: total - missing, missing, missingAmount, complete: missing === 0 });
const billingRow = (f) => f.items.find((i) => i.key === 'billing');

check('billing: all recent months complete, or billing not applicable, adds nothing', () => {
  const done = buildFollowUp({ ...quiet, billing: [bm('2026-08', 68, 0), bm('2026-09', 68, 0), bm('2026-10', 68, 0)] });
  assert.equal(billingRow(done), undefined);
  assert.deepEqual(done.unavailable, []);
  const na = buildFollowUp({ ...quiet, billing: undefined });
  assert.equal(billingRow(na), undefined);
  assert.deepEqual(na.unavailable, []);
});

check('billing: an incomplete current month names the month, the missing leases and their contract value', () => {
  const f = buildFollowUp({ ...quiet, today: '2026-10-18', billing: [bm('2026-08', 68, 0), bm('2026-09', 68, 0), bm('2026-10', 68, 16, 28400)] });
  const item = billingRow(f);
  assert.equal(item.count, 16);
  assert.equal(item.amount, 28400);
  assert.deepEqual(item.billing, { month: '2026-10', total: 68, earlierMonths: 0 });
  assert.equal(item.href, '/mall?tab=charges&billing=2026-10');
});

check('billing: a month with nothing to bill is not incomplete', () => {
  assert.equal(billingRow(buildFollowUp({ ...quiet, billing: [bm('2026-08', 0, 0), bm('2026-09', 0, 0), bm('2026-10', 0, 0)] })), undefined);
});

check('billing: the current month is a reminder in its first days and a warning from the 5th', () => {
  const rows = [bm('2026-08', 68, 0), bm('2026-09', 68, 0), bm('2026-10', 68, 10)];
  assert.equal(billingRow(buildFollowUp({ ...quiet, today: '2026-10-01', billing: rows })).tone, 'neutral');
  assert.equal(billingRow(buildFollowUp({ ...quiet, today: '2026-10-04', billing: rows })).tone, 'neutral');
  assert.equal(billingRow(buildFollowUp({ ...quiet, today: '2026-10-05', billing: rows })).tone, 'warn');
});

check('billing: a past month left incomplete is a warning even on the first day, and names that month', () => {
  const f = buildFollowUp({ ...quiet, today: '2026-10-01', billing: [bm('2026-08', 68, 0), bm('2026-09', 68, 3, 3600), bm('2026-10', 68, 0)] });
  const item = billingRow(f);
  assert.equal(item.tone, 'warn');
  assert.equal(item.billing.month, '2026-09');
  assert.equal(item.count, 3);
  assert.equal(item.href, '/mall?tab=charges&billing=2026-09');
});

check('billing: several incomplete months show the newest and count the earlier ones', () => {
  const f = buildFollowUp({ ...quiet, today: '2026-10-02', billing: [bm('2026-08', 66, 4), bm('2026-09', 68, 9), bm('2026-10', 68, 20)] });
  const item = billingRow(f);
  assert.equal(item.billing.month, '2026-10');
  assert.equal(item.billing.earlierMonths, 2);
  assert.equal(item.count, 20);
  assert.equal(item.tone, 'warn');
});

check('billing: a month after today is never late', () => {
  const f = buildFollowUp({ ...quiet, today: '2026-10-18', billing: [bm('2026-09', 68, 0), bm('2026-10', 68, 0), bm('2026-11', 68, 68)] });
  assert.equal(billingRow(f), undefined);
});

check('billing: no contract value leaves the amount empty', () => {
  const item = billingRow(buildFollowUp({ ...quiet, billing: [bm('2026-10', 5, 2, 0)] }));
  assert.equal(item.amount, null);
});

check('billing: unreadable charges are unavailable, not "nothing to bill"', () => {
  const f = buildFollowUp({ ...quiet, billing: null });
  assert.deepEqual(f.items, []);
  assert.deepEqual(f.unavailable, ['billing']);
});

check('billing: ranks after vouchers and before rent within the same tone', () => {
  const f = buildFollowUp({
    today: '2026-10-20',
    aging: [],
    expiry: expiry([]),
    rent: [rentRow('unpaid', 500, 0)],
    pendingVouchers: 2,
    longVacant: 1,
    billing: [bm('2026-10', 68, 5)],
  });
  assert.deepEqual(keys(f), ['vouchers', 'billing', 'rent', 'vacant']);
  assert.deepEqual(f.items.map((i) => i.tone), ['warn', 'warn', 'warn', 'neutral']);
});

check('billing: a failed billing source does not hide the others', () => {
  const f = buildFollowUp({ ...quiet, billing: null, pendingVouchers: 1 });
  assert.deepEqual(keys(f), ['vouchers']);
  assert.deepEqual(f.unavailable, ['billing']);
});

// ---------- rent the mall owes its landlords ----------

const owed = (over = {}) => ({ count: 2, amount: 57000, amountComplete: true, behind: 1, ...over });
const landlordRow = (f) => f.items.find((i) => i.key === 'landlords');

check('landlords: not shown to a user who may not see expenses, and not called unavailable', () => {
  const f = buildFollowUp({ ...quiet, landlords: undefined });
  assert.deepEqual(f.items, []);
  assert.deepEqual(f.unavailable, []);
});

check('landlords: a read that failed is unavailable, never "nothing owed", and hides no other row', () => {
  const f = buildFollowUp({ ...quiet, landlords: null, pendingVouchers: 1 });
  assert.deepEqual(keys(f), ['vouchers']);
  assert.deepEqual(f.unavailable, ['landlords']);
});

check('landlords: nobody owed means no row', () => {
  assert.deepEqual(buildFollowUp({ ...quiet, landlords: { count: 0, amount: 0, amountComplete: true, behind: 0 } }).items, []);
});

check('landlords: bad once a landlord is behind, a warning while it is only this month; the row opens the landlords list', () => {
  const behind = landlordRow(buildFollowUp({ ...quiet, landlords: owed() }));
  assert.equal(behind.tone, 'bad');
  assert.equal(behind.count, 2);
  assert.equal(behind.amount, 57000);
  assert.equal(behind.atLeast, undefined);
  assert.equal(behind.href, '/mall?tab=people&role=LANDLORD');
  const thisMonth = landlordRow(buildFollowUp({ ...quiet, landlords: owed({ behind: 0 }) }));
  assert.equal(thisMonth.tone, 'warn');
});

check('landlords: an owed month with no known amount makes the sum a floor; nothing known leaves the amount empty', () => {
  assert.equal(landlordRow(buildFollowUp({ ...quiet, landlords: owed({ amountComplete: false }) })).atLeast, true);
  const none = landlordRow(buildFollowUp({ ...quiet, landlords: owed({ amount: 0, amountComplete: false }) }));
  assert.equal(none.amount, null);
  assert.equal(none.atLeast, true);
});

check('landlords: ranks after arrears and before shops, and a bad row comes before a warning row', () => {
  const f = buildFollowUp({
    ...quiet,
    expiry: expiry([lease(1, day(10), 1200)]),
    aging: [{ total_outstanding: 9000, bucket_90_plus: 4000 }],
    rent: [rentRow('unpaid', 500, 0)],
    pendingVouchers: 2,
    longVacant: 1,
    landlords: owed(),
  });
  assert.deepEqual(keys(f), ['arrears60', 'landlords', 'ending30', 'vouchers', 'rent', 'vacant']);
  assert.deepEqual(f.items.map((i) => i.tone), ['bad', 'bad', 'warn', 'warn', 'warn', 'neutral']);
});

check('landlords: wording follows the tone and agrees with the count', () => {
  assert.equal(landlordFollowUpTitle('bad'), 'إيجار متأخر للمؤجرين');
  assert.equal(landlordFollowUpTitle('warn'), 'إيجار هذا الشهر للمؤجرين لم يُسدَّد');
  const detail = (count, amount, atLeast) => landlordFollowUpDetail({ count, amount, atLeast });
  assert.equal(detail(1, null), 'مؤجر واحد');
  assert.ok(detail(2, 52000).startsWith('مؤجران · المستحق للمؤجرين '));
  assert.ok(detail(3, 52000).startsWith('3 مؤجرين · '));
  assert.ok(detail(11, 52000).startsWith('11 مؤجراً · '));
  assert.ok(detail(1, 52000, true).endsWith(' على الأقل'));
  assert.ok(!detail(1, 52000).includes('على الأقل'));
  // a sum that stands on a guess says so; a floor needs only one qualifier
  const guessed = (atLeast) => landlordFollowUpDetail({ count: 2, amount: 52000, atLeast, estimated: true });
  assert.ok(guessed(undefined).endsWith(' تقريباً'));
  assert.ok(guessed(true).endsWith(' على الأقل') && !guessed(true).includes('تقريباً'));
  assert.ok(!landlordFollowUpDetail({ count: 2, amount: 52000, estimated: false }).includes('تقريباً'));
  assert.equal(landlordFollowUpDetail({ count: 2, amount: null, estimated: true }), 'مؤجران', 'no sum, nothing to qualify');
});

check('landlords: the estimate flag passes from the dues to the row, and is absent when the sum is exact', () => {
  assert.equal(landlordRow(buildFollowUp({ ...quiet, landlords: owed({ estimated: true }) })).estimated, true);
  assert.equal(landlordRow(buildFollowUp({ ...quiet, landlords: owed({ estimated: false }) })).estimated, undefined);
  assert.equal(landlordRow(buildFollowUp({ ...quiet, landlords: owed() })).estimated, undefined);
});

check('landlords: from the dues, a landlord filed under vendors and one under customers both count, an untagged customer does not', () => {
  const contact = (o) => ({ id: 'x', kind: 'VENDOR', name: 'x', notes: null, is_active: true, monthly_rent: null, contract_start: null, contract_end: null, job_title: null, department: null, created_at: '2026-06-01T10:00:00Z', ...o });
  const pay = (id, contact_id, tx_date, amount, description = null) => ({ id, contact_id, tx_date, amount, description, kind: 'EXPENSE', status: 'POSTED' });
  const contacts = [
    contact({ id: 'v', kind: 'VENDOR', name: 'عبدالله', notes: '[role:landlord]' }),
    contact({ id: 'c', kind: 'CUSTOMER', name: 'سالم', notes: '[role:landlord]', monthly_rent: '5000' }),
    contact({ id: 'n', kind: 'CUSTOMER', name: 'شركة', notes: '[role:customer]' }),
  ];
  const transactions = [
    pay('1', 'v', '2026-07-30', 25000),
    pay('2', 'v', '2026-07-31', 27000),
    pay('3', 'v', '2026-08-31', 52000),
    ...['2026-07', '2026-08', '2026-09', '2026-10'].map((m, i) => pay(`c${i}`, 'c', `${m}-05`, 5000)),
    pay('9', 'n', '2026-09-05', 800, 'ايجار شهر سبتمبر'),
  ];
  const dues = buildLandlordDues({ contacts, transactions, today: TODAY });
  assert.deepEqual(dues.rows.map((r) => r.contactId), ['v', 'c']);
  const attention = landlordDuesAttention(dues);
  // the vendor landlord paid July and August: September and October are owed at the estimated 52,000
  assert.deepEqual({ ...attention, href: undefined }, { count: 1, amount: 104000, amountComplete: true, estimated: true, behind: 1, tone: 'bad', href: undefined });
  assert.equal(attention.href, LANDLORD_DUES_HREF);
  const f = buildFollowUp({ ...quiet, landlords: attention });
  assert.deepEqual(landlordRow(f), { key: 'landlords', tone: 'bad', count: 1, amount: 104000, estimated: true, href: '/mall?tab=people&role=LANDLORD' });
  // everyone paid up: no attention, so no row
  assert.equal(landlordDuesAttention(buildLandlordDues({ contacts: [contacts[1]], transactions, today: TODAY })), null);
});

check('landlords: months before the system are never owed, so a landlord with no payment yet is only this month', () => {
  const contact = { id: 'v', kind: 'VENDOR', name: 'عبدالله', notes: '[role:landlord]', is_active: true, monthly_rent: '10000', contract_start: null, contract_end: null, job_title: null, department: null, created_at: '2026-06-01T10:00:00Z' };
  const dues = buildLandlordDues({ contacts: [contact], transactions: [], today: TODAY });
  const attention = landlordDuesAttention(dues);
  assert.equal(attention.count, 1);
  // June to October have started and nothing was paid: from the go-live month they are owed; January to May are not
  assert.equal(attention.amount, 50000);
  assert.equal(dues.rows[0].arrears.months[0].monthKey, '2026-06');
});

console.log(`\n${passed} checks passed`);
