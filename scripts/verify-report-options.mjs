/**
 * The logic behind the PDF options dialogs (src/lib/report-options.ts): date presets at month ends and on a
 * leap day, a range with from after to, the filters (an empty selection means no restriction), the status
 * rule (voided never counts, drafts only when asked), string amounts and three-decimal sums, sorting,
 * grouping with subtotals, the list counts, the page estimate, warnings, the file name and the saved presets
 * (round trip, damaged data, storage that throws).
 *   npx tsx scripts/verify-report-options.mjs
 */
import assert from 'node:assert/strict';

const R = await import('../src/lib/report-options.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-19';
let seq = 0;
const tx = (o = {}) => ({
  id: `t${++seq}`,
  number: 1000 + seq,
  status: 'POSTED',
  method: 'CASH',
  amount: '100',
  tx_date: '2026-10-05',
  category_id: 'c1',
  cashbox_id: 'b1',
  category: { id: 'c1', name_ar: 'إيجارات', code: 'REV-RNT' },
  cashbox: { id: 'b1', name_ar: 'الخزينة النقدية' },
  contact: { id: 'p1', name: 'محل الأمل' },
  ...o,
});
const opts = (patch = {}) => {
  const base = R.defaultReportOptions(TODAY);
  return {
    period: { ...base.period, ...(patch.period ?? {}) },
    filters: { ...base.filters, ...(patch.filters ?? {}) },
    layout: { ...base.layout, ...(patch.layout ?? {}) },
  };
};
const ids = (rows) => rows.map((r) => r.id);

// ── calendar and date presets ────────────────────────────────────────────────

check('isValidISODate: real days only, leap day only in a leap year', () => {
  assert.equal(R.isValidISODate('2028-02-29'), true);
  assert.equal(R.isValidISODate('2027-02-29'), false);
  assert.equal(R.isValidISODate('2100-02-29'), false); // not a leap year (century)
  assert.equal(R.isValidISODate('2000-02-29'), true);
  assert.equal(R.isValidISODate('2026-13-01'), false);
  assert.equal(R.isValidISODate('2026-00-10'), false);
  assert.equal(R.isValidISODate('2026-04-31'), false);
  assert.equal(R.isValidISODate('2026-4-1'), false);
  assert.equal(R.isValidISODate(''), false);
});

check('quick periods: this month ends on the right day in every month length', () => {
  assert.deepEqual(R.quickPeriodRange('THIS_MONTH', '2026-10-19'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(R.quickPeriodRange('THIS_MONTH', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(R.quickPeriodRange('THIS_MONTH', '2028-02-10'), { from: '2028-02-01', to: '2028-02-29' });
  assert.deepEqual(R.quickPeriodRange('THIS_MONTH', '2026-04-30'), { from: '2026-04-01', to: '2026-04-30' });
});

check('quick periods: last month wraps over the new year and keeps a short month short', () => {
  assert.deepEqual(R.quickPeriodRange('LAST_MONTH', '2026-01-05'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(R.quickPeriodRange('LAST_MONTH', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(R.quickPeriodRange('LAST_MONTH', '2028-03-01'), { from: '2028-02-01', to: '2028-02-29' });
});

check('quick periods: the quarter holds the month in every position', () => {
  const q = (d) => R.quickPeriodRange('THIS_QUARTER', d);
  assert.deepEqual(q('2026-01-01'), { from: '2026-01-01', to: '2026-03-31' });
  assert.deepEqual(q('2026-03-31'), { from: '2026-01-01', to: '2026-03-31' });
  assert.deepEqual(q('2026-04-01'), { from: '2026-04-01', to: '2026-06-30' });
  assert.deepEqual(q('2026-08-15'), { from: '2026-07-01', to: '2026-09-30' });
  assert.deepEqual(q('2026-10-19'), { from: '2026-10-01', to: '2026-12-31' });
  assert.deepEqual(q('2026-12-31'), { from: '2026-10-01', to: '2026-12-31' });
});

check('quick periods: this year, last year, last 30 days (today included, across a leap day)', () => {
  assert.deepEqual(R.quickPeriodRange('THIS_YEAR', TODAY), { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(R.quickPeriodRange('LAST_YEAR', TODAY), { from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(R.quickPeriodRange('LAST_30_DAYS', '2026-10-19'), { from: '2026-09-20', to: '2026-10-19' });
  assert.deepEqual(R.quickPeriodRange('LAST_30_DAYS', '2028-03-10'), { from: '2028-02-10', to: '2028-03-10' }); // 30 days incl. 29 Feb
  assert.deepEqual(R.quickPeriodRange('LAST_30_DAYS', '2027-03-10'), { from: '2027-02-09', to: '2027-03-10' });
  assert.deepEqual(R.quickPeriodRange('LAST_30_DAYS', '2026-01-10'), { from: '2025-12-12', to: '2026-01-10' });
});

check('formatDmy puts the day first', () => {
  assert.equal(R.formatDmy('2026-10-01'), '01/10/2026');
  assert.equal(R.formatDmy('nope'), 'nope');
});

// ── resolving the period ─────────────────────────────────────────────────────

check('period ALL: no bounds; the range in words comes from the entries when known', () => {
  const p = R.resolvePeriod(R.defaultPeriod(TODAY), TODAY, { min: '2026-01-11', max: '2026-10-12' });
  assert.equal(p.valid, true);
  assert.equal(p.from, null);
  assert.equal(p.words, 'من 11/01/2026 إلى 12/10/2026');
  assert.equal(p.label, 'كامل المدة المسجلة');
  assert.equal(R.resolvePeriod(R.defaultPeriod(TODAY), TODAY).words, 'كامل المدة المسجلة');
});

check('period QUICK: the range is put in words', () => {
  const p = R.resolvePeriod({ ...R.defaultPeriod(TODAY), mode: 'QUICK', quick: 'THIS_MONTH' }, TODAY);
  assert.equal(p.words, 'من 01/10/2026 إلى 31/10/2026');
  assert.equal(p.label, p.words);
  assert.equal(p.slug, '2026-10-01_2026-10-31');
});

check('period MONTHS: one block reads as a range, a gap lists the months, none is invalid', () => {
  const base = { ...R.defaultPeriod(TODAY), mode: 'MONTHS', year: 2026 };
  const one = R.resolvePeriod({ ...base, months: [10] }, TODAY);
  assert.equal(one.words, 'من 01/10/2026 إلى 31/10/2026');
  assert.equal(one.slug, '2026-10');
  const block = R.resolvePeriod({ ...base, months: [3, 1, 2] }, TODAY);
  assert.equal(block.words, 'من 01/01/2026 إلى 31/03/2026');
  assert.equal(block.monthKeys, null);
  assert.equal(block.slug, '2026-01_2026-03');
  const gap = R.resolvePeriod({ ...base, months: [5, 1, 3] }, TODAY);
  assert.equal(gap.words, 'أشهر يناير، مارس، مايو 2026');
  assert.deepEqual(gap.monthKeys, ['2026-01', '2026-03', '2026-05']);
  assert.equal(gap.from, '2026-01-01');
  assert.equal(gap.to, '2026-05-31');
  const all = R.resolvePeriod({ ...base, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, TODAY);
  assert.equal(all.slug, '2026');
  const feb = R.resolvePeriod({ ...base, year: 2028, months: [2] }, TODAY);
  assert.equal(feb.words, 'من 01/02/2028 إلى 29/02/2028');
  const none = R.resolvePeriod({ ...base, months: [] }, TODAY);
  assert.equal(none.valid, false);
  assert.match(none.error, /شهراً/);
  assert.equal(R.resolvePeriod({ ...base, months: [0, 13, 2.5, 4, 4] }, TODAY).words, 'من 01/04/2026 إلى 30/04/2026');
});

check('period RANGE: from after to, impossible dates and an empty range are refused with a reason', () => {
  const base = { ...R.defaultPeriod(TODAY), mode: 'RANGE' };
  const crossed = R.resolvePeriod({ ...base, from: '2026-10-31', to: '2026-10-01' }, TODAY);
  assert.equal(crossed.valid, false);
  assert.match(crossed.error, /بعد/);
  assert.equal(R.resolvePeriod({ ...base, from: '2027-02-29', to: '2027-03-01' }, TODAY).valid, false);
  assert.equal(R.resolvePeriod({ ...base, from: '', to: '' }, TODAY).valid, false);
  const same = R.resolvePeriod({ ...base, from: '2026-10-05', to: '2026-10-05' }, TODAY);
  assert.equal(same.valid, true); // one day is a range
  assert.equal(same.words, 'من 05/10/2026 إلى 05/10/2026');
  const leap = R.resolvePeriod({ ...base, from: '2028-02-29', to: '2028-03-01' }, TODAY);
  assert.equal(leap.valid, true);
});

check('period RANGE: one open end is allowed and says so', () => {
  const base = { ...R.defaultPeriod(TODAY), mode: 'RANGE' };
  const from = R.resolvePeriod({ ...base, from: '2026-03-01', to: '' }, TODAY);
  assert.equal(from.words, 'من 01/03/2026');
  assert.equal(from.to, null);
  const to = R.resolvePeriod({ ...base, from: '', to: '2026-03-31' }, TODAY);
  assert.equal(to.words, 'حتى 31/03/2026');
});

check('matchesPeriod: bounds are inclusive, timestamps and missing dates are handled, an invalid period matches nothing', () => {
  const p = R.resolvePeriod({ ...R.defaultPeriod(TODAY), mode: 'RANGE', from: '2026-10-01', to: '2026-10-31' }, TODAY);
  assert.equal(R.matchesPeriod('2026-10-01', p), true);
  assert.equal(R.matchesPeriod('2026-10-31', p), true);
  assert.equal(R.matchesPeriod('2026-10-31T23:59:59Z', p), true);
  assert.equal(R.matchesPeriod('2026-09-30', p), false);
  assert.equal(R.matchesPeriod('2026-11-01', p), false);
  assert.equal(R.matchesPeriod(null, p), false);
  assert.equal(R.matchesPeriod('garbage', p), false);
  const bad = R.resolvePeriod({ ...R.defaultPeriod(TODAY), mode: 'RANGE', from: '2026-10-31', to: '2026-10-01' }, TODAY);
  assert.equal(R.matchesPeriod('2026-10-15', bad), false);
  const all = R.resolvePeriod(R.defaultPeriod(TODAY), TODAY);
  assert.equal(R.matchesPeriod(null, all), true);
  const gap = R.resolvePeriod({ ...R.defaultPeriod(TODAY), mode: 'MONTHS', year: 2026, months: [1, 3] }, TODAY);
  assert.equal(R.matchesPeriod('2026-02-10', gap), false);
  assert.equal(R.matchesPeriod('2026-03-10', gap), true);
  assert.equal(R.matchesPeriod('2025-03-10', gap), false);
});

check('monthsCovering: the months of a range, in its last year, for starting the month picker', () => {
  assert.deepEqual(R.monthsCovering('2026-10-01', '2026-10-31'), { year: 2026, months: [10] });
  assert.deepEqual(R.monthsCovering('2026-01-01', '2026-12-31'), { year: 2026, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
  assert.deepEqual(R.monthsCovering('2026-09-20', '2026-10-19'), { year: 2026, months: [9, 10] });
  assert.deepEqual(R.monthsCovering('2025-11-15', '2026-02-10'), { year: 2026, months: [1, 2] }); // across the new year: the last year only
  assert.deepEqual(R.monthsCovering('2028-02-29', '2028-02-29'), { year: 2028, months: [2] });
  assert.equal(R.monthsCovering(null, '2026-10-01'), null);
  assert.equal(R.monthsCovering('2026-10-01', ''), null);
  assert.equal(R.monthsCovering('2026-10-31', '2026-10-01'), null); // from after to
  assert.equal(R.monthsCovering('2027-02-29', '2027-03-01'), null); // not a calendar day
});

check('availableYears: this year, last year and every year in the data, newest first', () => {
  assert.deepEqual(R.availableYears(['2024-05-01', null, 'x', '2026-01-02T00:00:00Z'], TODAY), [2026, 2025, 2024]);
  assert.deepEqual(R.availableYears([], TODAY), [2026, 2025]);
});

// ── amounts and status ───────────────────────────────────────────────────────

check('amounts: strings, Arabic digits, commas and nonsense', () => {
  assert.deepEqual(R.parseAmountRange('', ''), { min: null, max: null, error: null });
  assert.deepEqual(R.parseAmountRange('100', '1,250.5'), { min: 100, max: 1250.5, error: null });
  assert.deepEqual(R.parseAmountRange('١٠٠', '٢٠٠٫٥'), { min: 100, max: 200.5, error: null });
  assert.match(R.parseAmountRange('abc', '').error, /غير صحيح/);
  assert.match(R.parseAmountRange('-5', '').error, /غير صحيح/);
  assert.match(R.parseAmountRange('1.2345', '').error, /غير صحيح/); // four decimals
  assert.match(R.parseAmountRange('500', '100').error, /أكبر/);
  assert.equal(R.parseAmountRange('100', '100').error, null);
  assert.equal(R.parseAmountRange('0', '').error, null);
});

check('amount sums are exact to the thousandth and survive strings and junk', () => {
  assert.equal(R.sumAmounts([{ amount: 0.1 }, { amount: 0.2 }]), 0.3);
  assert.equal(R.sumAmounts([{ amount: '1500.125' }, { amount: '0.375' }, { amount: null }, { amount: 'abc' }, {}]), 1500.5);
  assert.equal(R.amountMillis({ amount: '2.0005' }), 2001); // rounds half up at the thousandth
  assert.equal(R.amountMillis({ amount: undefined }), 0);
});

check('status: posted and reconciled count, drafts only when asked, voided never', () => {
  assert.equal(R.isCountedStatus('POSTED', false), true);
  assert.equal(R.isCountedStatus('RECONCILED', false), true);
  assert.equal(R.isCountedStatus('DRAFT', false), false);
  assert.equal(R.isCountedStatus('DRAFT', true), true);
  assert.equal(R.isCountedStatus('VOIDED', true), false);
  assert.equal(R.isCountedStatus(null, false), true);
  assert.equal(R.isCountedStatus('WHATEVER', true), false);
});

// ── selecting rows ───────────────────────────────────────────────────────────

check('selection: default options keep every counted row and drop voided and drafts, with the number dropped', () => {
  const rows = [tx(), tx({ status: 'RECONCILED' }), tx({ status: 'VOIDED' }), tx({ status: 'DRAFT' }), tx({ status: 'VOIDED' })];
  const sel = R.selectReportRows(rows, opts(), TODAY);
  assert.equal(sel.rows.length, 2);
  assert.deepEqual(sel.excluded, { voided: 2, drafts: 1 });
  assert.equal(sel.valid, true);
  const withDrafts = R.selectReportRows(rows, opts({ filters: { includeDrafts: true } }), TODAY);
  assert.equal(withDrafts.rows.length, 3);
  assert.equal(withDrafts.excluded.drafts, 0);
  assert.equal(withDrafts.rows.some((r) => r.status === 'VOIDED'), false);
});

check('selection: empty selections mean no restriction, a chosen one narrows, several are a union', () => {
  const a = tx({ category_id: 'c1' });
  const b = tx({ category_id: 'c2', category: { id: 'c2', name_ar: 'مواقف' } });
  const c = tx({ category_id: null, category: null });
  const rows = [a, b, c];
  assert.equal(R.selectReportRows(rows, opts({ filters: { categoryIds: [] } }), TODAY).rows.length, 3);
  assert.deepEqual(ids(R.selectReportRows(rows, opts({ filters: { categoryIds: ['c2'] } }), TODAY).rows), [b.id]);
  assert.equal(R.selectReportRows(rows, opts({ filters: { categoryIds: ['c1', 'c2'] } }), TODAY).rows.length, 2);
  assert.equal(R.selectReportRows(rows, opts({ filters: { categoryIds: ['zzz'] } }), TODAY).rows.length, 0);
});

check('selection: the category id falls back to the joined category when category_id is absent', () => {
  const a = tx({ category_id: undefined });
  assert.equal(R.selectReportRows([a], opts({ filters: { categoryIds: ['c1'] } }), TODAY).rows.length, 1);
});

check('selection: parties, entries without a party, cashboxes and methods', () => {
  const withParty = tx({ contact: { id: 'p1', name: 'محل الأمل' } });
  const other = tx({ contact: { id: 'p2', name: 'مطعم البحر' } });
  const none = tx({ contact: null });
  const card = tx({ method: 'CARD', cashbox_id: 'b2', cashbox: { id: 'b2', name_ar: 'مصرف' }, contact: { id: 'p3', name: 'ثالث' } });
  const blankMethod = tx({ method: null, contact: { id: 'p3', name: 'ثالث' } });
  const rows = [withParty, other, none, card, blankMethod];
  assert.deepEqual(ids(R.selectReportRows(rows, opts({ filters: { partyIds: ['p2'] } }), TODAY).rows), [other.id]);
  assert.deepEqual(ids(R.selectReportRows(rows, opts({ filters: { partyIds: [R.NO_PARTY] } }), TODAY).rows).sort(), [none.id].sort());
  assert.equal(R.selectReportRows(rows, opts({ filters: { partyIds: [R.NO_PARTY, 'p1'] } }), TODAY).rows.length, 2);
  assert.deepEqual(ids(R.selectReportRows(rows, opts({ filters: { cashboxIds: ['b2'] } }), TODAY).rows), [card.id]);
  assert.deepEqual(ids(R.selectReportRows(rows, opts({ filters: { methods: ['CARD'] } }), TODAY).rows), [card.id]);
  // a row without a method is cash, as the PDF reads it
  assert.equal(R.selectReportRows(rows, opts({ filters: { methods: ['CASH'] } }), TODAY).rows.includes(blankMethod), true);
});

check('selection: amount limits are inclusive, work on string amounts and compare at the thousandth', () => {
  const rows = [tx({ amount: '99.999' }), tx({ amount: '100' }), tx({ amount: '250.5' }), tx({ amount: '500' }), tx({ amount: '500.001' })];
  const amounts = (o) => R.selectReportRows(rows, opts({ filters: o }), TODAY).rows.map((r) => r.amount).sort();
  assert.deepEqual(amounts({ minAmount: '100', maxAmount: '500' }), ['100', '250.5', '500']);
  assert.deepEqual(amounts({ minAmount: '100' }), ['100', '250.5', '500', '500.001']);
  assert.deepEqual(amounts({ maxAmount: '99.999' }), ['99.999']);
  const crossed = R.selectReportRows(rows, opts({ filters: { minAmount: '500', maxAmount: '100' } }), TODAY);
  assert.equal(crossed.rows.length, 0);
  assert.equal(crossed.valid, false);
  assert.equal(crossed.issues.length, 1);
});

check('selection: the period filters by day and an invalid range yields an issue, not rows', () => {
  const rows = [tx({ tx_date: '2026-09-30' }), tx({ tx_date: '2026-10-01' }), tx({ tx_date: '2026-10-31' }), tx({ tx_date: '2026-11-01' }), tx({ tx_date: null })];
  const oct = R.selectReportRows(rows, opts({ period: { mode: 'QUICK', quick: 'THIS_MONTH' } }), TODAY);
  assert.deepEqual(oct.rows.map((r) => r.tx_date).sort(), ['2026-10-01', '2026-10-31']);
  assert.equal(oct.inPeriod, 2);
  const all = R.selectReportRows(rows, opts(), TODAY);
  assert.equal(all.rows.length, 5); // everything, even the entry with no date
  const bad = R.selectReportRows(rows, opts({ period: { mode: 'RANGE', from: '2026-10-31', to: '2026-10-01' } }), TODAY);
  assert.equal(bad.rows.length, 0);
  assert.equal(bad.valid, false);
});

check('selection: «بدون بند» and «بدون خزينة» are real choices: ticking one keeps exactly the entries that have none', () => {
  const full = tx();
  const noCat = tx({ category_id: null, category: null });
  const noBox = tx({ cashbox_id: null, cashbox: null });
  const rows = [full, noCat, noBox];
  const pick = (filters) => ids(R.selectReportRows(rows, opts({ filters }), TODAY).rows).sort();
  assert.deepEqual(pick({ categoryIds: [R.NO_CATEGORY] }), [noCat.id]);
  assert.deepEqual(pick({ categoryIds: [R.NO_CATEGORY, 'c1'] }), [full.id, noCat.id, noBox.id].sort());
  assert.deepEqual(pick({ cashboxIds: [R.NO_CASHBOX] }), [noBox.id]);
  assert.deepEqual(pick({ cashboxIds: [R.NO_CASHBOX, 'b1'] }), [full.id, noCat.id, noBox.id].sort());
  // the list offers them under the same ids, so what a choice shows (count and total) is what ticking it gives
  const cats = R.facetItems(rows, 'category', []);
  assert.equal(cats.find((i) => i.id === R.NO_CATEGORY).count, pick({ categoryIds: [R.NO_CATEGORY] }).length);
  const boxes = R.facetItems(rows, 'cashbox', []);
  assert.equal(boxes.find((i) => i.id === R.NO_CASHBOX).count, pick({ cashboxIds: [R.NO_CASHBOX] }).length);
  assert.equal(boxes.find((i) => i.id === R.NO_CASHBOX).label, 'بدون خزينة');
});

check('selection: a voided or draft entry outside the period or the filters is not reported as left out', () => {
  const rows = [
    tx({ status: 'VOIDED', tx_date: '2026-10-05' }), // in the period: counted as left out
    tx({ status: 'VOIDED', tx_date: '2025-10-05' }), // another year
    tx({ status: 'VOIDED', method: 'CARD' }), // another method
    tx({ status: 'DRAFT', tx_date: '2026-09-30' }),
    tx(),
  ];
  const sel = R.selectReportRows(rows, opts({ period: { mode: 'QUICK', quick: 'THIS_MONTH' }, filters: { methods: ['CASH'] } }), TODAY);
  assert.equal(sel.rows.length, 1);
  assert.deepEqual(sel.excluded, { voided: 1, drafts: 0 });
});

check('selection: a very large list of rows and of chosen ids stays correct', () => {
  const many = Array.from({ length: 6000 }, (_, i) => tx({ id: `m${i}`, number: i, category_id: `k${i % 1500}`, category: { id: `k${i % 1500}`, name_ar: `بند ${i % 1500}` }, contact: { id: `q${i % 300}`, name: `جهة ${i % 300}` } }));
  const chosen = Array.from({ length: 1000 }, (_, i) => `k${i}`);
  const started = Date.now();
  const sel = R.selectReportRows(many, opts({ filters: { categoryIds: chosen } }), TODAY);
  assert.equal(sel.rows.length, 4000); // 1000 of the 1500 accounts, 4 entries each
  assert.ok(Date.now() - started < 2000, 'a thousand chosen accounts over six thousand entries takes well under two seconds');
  const items = R.facetItems(many, 'party', []);
  assert.equal(items.length, 300);
  assert.equal(items[0].count, 20);
});

check('selection: inPeriod counts what the period alone would give, so «بدون التصفية» is honest', () => {
  const rows = [tx(), tx({ category_id: 'c2' }), tx({ category_id: 'c2' })];
  const sel = R.selectReportRows(rows, opts({ filters: { categoryIds: ['c9'] } }), TODAY);
  assert.equal(sel.rows.length, 0);
  assert.equal(sel.inPeriod, 3);
});

check('sorting: newest first, oldest first and largest first, ties by number, input order never matters', () => {
  const a = tx({ id: 'a', number: 5, tx_date: '2026-10-02', amount: '10' });
  const b = tx({ id: 'b', number: 6, tx_date: '2026-10-02', amount: '30' });
  const c = tx({ id: 'c', number: 3, tx_date: '2026-09-01', amount: '30' });
  const d = tx({ id: 'd', number: 9, tx_date: '2026-10-20', amount: '5' });
  const rows = [a, b, c, d];
  assert.deepEqual(ids(R.sortTransactions(rows, 'DATE_DESC')), ['d', 'b', 'a', 'c']);
  assert.deepEqual(ids(R.sortTransactions(rows, 'DATE_ASC')), ['c', 'a', 'b', 'd']);
  assert.deepEqual(ids(R.sortTransactions(rows, 'AMOUNT_DESC')), ['b', 'c', 'a', 'd']);
  assert.deepEqual(ids(R.sortTransactions([...rows].reverse(), 'DATE_DESC')), ['d', 'b', 'a', 'c']);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c', 'd']); // the input is not changed
  const strNums = [tx({ id: 'x', number: '10', tx_date: '2026-10-01' }), tx({ id: 'y', number: '9', tx_date: '2026-10-01' })];
  assert.deepEqual(ids(R.sortTransactions(strNums, 'DATE_ASC')), ['y', 'x']); // numeric, not text, order
});

// ── grouping and summary ─────────────────────────────────────────────────────

const sample = () => [
  tx({ id: 'g1', amount: '100.1', method: 'CASH', tx_date: '2026-08-10', category_id: 'c1', cashbox_id: 'b1', contact: { id: 'p1', name: 'محل الأمل' } }),
  tx({ id: 'g2', amount: '200.2', method: 'CASH', tx_date: '2026-10-02', category_id: 'c2', category: { id: 'c2', name_ar: 'مواقف' }, contact: { id: 'p2', name: 'مطعم' } }),
  tx({ id: 'g3', amount: '50', method: 'CARD', tx_date: '2026-10-09', category_id: 'c1', cashbox_id: 'b2', cashbox: { id: 'b2', name_ar: 'مصرف' }, contact: null }),
  tx({ id: 'g4', amount: '0.2', method: 'CHEQUE', tx_date: '2026-09-15', category_id: null, category: null, contact: { id: 'p1', name: 'محل الأمل' } }),
  tx({ id: 'g5', amount: '0.1', method: 'CASH', tx_date: null, contact: null }),
];

check('grouping: subtotals are exact and add up to the grand total for every grouping', () => {
  const rows = R.sortTransactions(sample(), 'DATE_DESC');
  const grand = R.sumAmounts(rows);
  for (const g of ['METHOD', 'NONE', 'CATEGORY', 'PARTY', 'CASHBOX', 'MONTH']) {
    const groups = R.groupTransactions(rows, g, 'DATE_DESC');
    assert.equal(R.sumAmounts(groups.map((x) => ({ amount: x.total }))), grand, `${g} totals add up`);
    assert.equal(groups.reduce((s, x) => s + x.count, 0), rows.length, `${g} counts add up`);
    assert.equal(new Set(groups.map((x) => x.key)).size, groups.length, `${g} keys are unique`);
    for (const x of groups) assert.equal(x.count, x.items.length);
  }
});

check('grouping: method groups, largest first, with Arabic names', () => {
  const groups = R.groupTransactions(R.sortTransactions(sample(), 'DATE_DESC'), 'METHOD');
  assert.deepEqual(groups.map((g) => [g.key, g.label, g.total]), [
    ['CASH', 'نقدي', 300.4],
    ['CARD', 'بطاقة', 50],
    ['CHEQUE', 'صك', 0.2],
  ]);
});

check('grouping: no grouping is one group; category, party and cashbox name the empty case', () => {
  const rows = R.sortTransactions(sample(), 'DATE_DESC');
  const none = R.groupTransactions(rows, 'NONE');
  assert.equal(none.length, 1);
  assert.equal(none[0].count, 5);
  assert.deepEqual(none[0].items.map((r) => r.id), rows.map((r) => r.id));
  const cat = R.groupTransactions(rows, 'CATEGORY');
  assert.equal(cat.find((g) => g.key === 'none').label, 'بدون بند');
  const party = R.groupTransactions(rows, 'PARTY');
  assert.equal(party.find((g) => g.key === R.NO_PARTY).label, 'بدون جهة');
  assert.equal(party.find((g) => g.key === 'p1').count, 2);
  const box = R.groupTransactions(rows, 'CASHBOX');
  assert.deepEqual(box.map((g) => g.key), ['b1', 'b2']);
});

check('grouping by month: chronological in the direction of the sort, undated entries last, named in Arabic', () => {
  const rows = sample();
  const desc = R.groupTransactions(R.sortTransactions(rows, 'DATE_DESC'), 'MONTH', 'DATE_DESC');
  assert.deepEqual(desc.map((g) => g.label), ['أكتوبر 2026', 'سبتمبر 2026', 'أغسطس 2026', 'بدون تاريخ']);
  const asc = R.groupTransactions(R.sortTransactions(rows, 'DATE_ASC'), 'MONTH', 'DATE_ASC');
  assert.deepEqual(asc.map((g) => g.label), ['أغسطس 2026', 'سبتمبر 2026', 'أكتوبر 2026', 'بدون تاريخ']);
  assert.equal(R.groupTransactions([], 'MONTH').length, 0);
});

check('grouping keeps the sorted order inside each group', () => {
  const rows = R.sortTransactions(sample(), 'AMOUNT_DESC');
  const g = R.groupTransactions(rows, 'METHOD').find((x) => x.key === 'CASH');
  assert.deepEqual(g.items.map((r) => r.id), ['g2', 'g1', 'g5']);
});

check('summary: counts distinct accounts, parties, cashboxes, months and methods, with the date span', () => {
  const s = R.summarizeRows(sample());
  assert.equal(s.count, 5);
  assert.equal(s.total, 350.6);
  assert.equal(s.parties, 2);
  assert.equal(s.categories, 3); // c1, c2 and none
  assert.equal(s.cashboxes, 2);
  assert.equal(s.methods, 3);
  assert.equal(s.months, 3);
  assert.equal(s.firstDate, '2026-08-10');
  assert.equal(s.lastDate, '2026-10-09');
  assert.equal(s.byMethod[0].method, 'CASH');
  const empty = R.summarizeRows([]);
  assert.deepEqual([empty.count, empty.total, empty.firstDate, empty.byMethod.length], [0, 0, null, 0]);
});

// ── list counts ──────────────────────────────────────────────────────────────

check('list counts: per-choice counts and totals, empty choices last, unknown choices added from the rows', () => {
  const rows = sample();
  const catalog = [
    { id: 'c9', label: 'بند بلا حركة' },
    { id: 'c1', label: 'إيجارات', hint: 'REV-RNT' },
    { id: 'c2', label: 'مواقف' },
  ];
  const items = R.facetItems(rows, 'category', catalog);
  // c1 holds g1, g3 and g5 (g5 has no date but a category): 100.1 + 50 + 0.1
  assert.deepEqual(items.map((i) => [i.id, i.count, i.total]), [
    ['c2', 1, 200.2],
    ['c1', 3, 150.2],
    ['none', 1, 0.2],
    ['c9', 0, 0],
  ]);
  assert.equal(items[0].id, 'c2'); // largest total first
  assert.equal(items.at(-1).id, 'c9'); // no entries: last
  assert.equal(items.find((i) => i.id === 'none').label, 'بدون بند');
  assert.equal(items.find((i) => i.id === 'c1').hint, 'REV-RNT');
});

check('list counts: a facet counted without its own filter shows what each choice would add', () => {
  const rows = [tx({ category_id: 'c1', contact: { id: 'p1', name: 'أ' } }), tx({ category_id: 'c2', contact: { id: 'p1', name: 'أ' } }), tx({ category_id: 'c2', contact: { id: 'p2', name: 'ب' } })];
  const o = opts({ filters: { categoryIds: ['c1'], partyIds: ['p1'] } });
  // the party list is counted under the category filter but not under its own party filter
  const forParties = rows.filter(R.buildRowTest(o, TODAY, { skip: 'party' }).test);
  const parties = R.facetItems(forParties, 'party', [{ id: 'p1', label: 'أ' }, { id: 'p2', label: 'ب' }]);
  assert.deepEqual(parties.map((p) => [p.id, p.count]), [['p1', 1], ['p2', 0]]);
});

// ── estimate and warnings ────────────────────────────────────────────────────

check('page estimate: at least one page, grows with rows and groups, summaries cost room, never NaN', () => {
  const p = (rows, groups = 1, includeSummaries = false, extra = {}) => R.estimatePages({ rows, groups, includeSummaries, ...extra });
  assert.equal(p(0), 1);
  assert.equal(p(1), 1);
  assert.ok(p(100) > p(50));
  assert.ok(p(100, 8) >= p(100, 1));
  assert.ok(p(30, 1, true) >= p(30, 1, false));
  assert.ok(p(30, 1, false, { signature: true }) >= p(30, 1, false));
  for (const n of [1, 9, 10, 11, 32, 33, 500, 5000]) assert.ok(Number.isInteger(p(n, 3, true)) && p(n, 3, true) >= 1);
  assert.equal(p(-5), 1);
  assert.equal(p(Number.NaN), 1);
});

check('page estimate matches measured PDFs (revenues report, 1 and 3 groups)', () => {
  const p = (rows, groups, includeSummaries) => R.estimatePages({ rows, groups, includeSummaries, summaryRows: 3 });
  // measured page counts of the real report: [rows, groups, summaries, pages]
  const measured = [
    [6, 1, false, 1], [8, 1, false, 2], [25, 1, false, 3], [50, 1, false, 4], [100, 1, false, 7], [150, 1, false, 9],
    [3, 3, false, 2], [20, 3, false, 3], [70, 3, false, 6], [100, 3, false, 7], [150, 3, false, 10],
    [6, 3, true, 2], [30, 3, true, 3], [50, 3, true, 5], [150, 3, true, 10],
  ];
  for (const [rows, groups, summaries, pages] of measured) assert.ok(Math.abs(p(rows, groups, summaries) - pages) <= 1, `${rows} rows, ${groups} groups`);
  assert.equal(p(100, 1, false), 7);
  assert.equal(p(150, 3, true), 10);
  // a long summary table pushes the rows down; a single account has no summary table at all
  assert.ok(R.estimatePages({ rows: 30, groups: 1, includeSummaries: true, summaryRows: 20 }) > R.estimatePages({ rows: 30, groups: 1, includeSummaries: true, summaryRows: 3 }));
  assert.equal(R.estimatePages({ rows: 8, groups: 1, includeSummaries: true, summaryRows: 1 }), R.estimatePages({ rows: 8, groups: 1, includeSummaries: false }));
});

check('warnings: nothing matches (with the count before filtering), a wrong option, a very large report, what was left out', () => {
  const base = { count: 5, pages: 2, issues: [], inPeriod: 5, excluded: { voided: 0, drafts: 0 } };
  assert.deepEqual(R.reportWarnings(base), []);
  const none = R.reportWarnings({ ...base, count: 0, inPeriod: 12 });
  assert.equal(none.length, 1);
  assert.equal(none[0].tone, 'warning');
  assert.match(none[0].text, /12/);
  assert.match(R.reportWarnings({ ...base, count: 0, inPeriod: 0 })[0].text, /لا توجد معاملات/);
  const issue = R.reportWarnings({ ...base, count: 0, issues: ['تاريخ البداية بعد تاريخ النهاية.'] });
  assert.equal(issue.length, 1); // the reason, not a second «nothing matches»
  assert.equal(issue[0].text, 'تاريخ البداية بعد تاريخ النهاية.');
  const large = R.reportWarnings({ ...base, pages: R.LARGE_REPORT_PAGES });
  assert.equal(large[0].tone, 'info');
  assert.equal(R.reportWarnings({ ...base, pages: R.LARGE_REPORT_PAGES - 1 }).length, 0);
  const left = R.reportWarnings({ ...base, excluded: { voided: 2, drafts: 1 } });
  assert.equal(left.length, 2);
  assert.match(left[0].text, /ملغاتان/);
  assert.match(left[1].text, /مسودة/);
});

// ── file name ────────────────────────────────────────────────────────────────

check('file name carries the report kind, the scope and the period, and is safe', () => {
  assert.equal(
    R.reportFileName({ kindAr: 'إيرادات', scope: 'كافة بنود الإيرادات', periodSlug: '2026-10-01_2026-10-31', today: TODAY }),
    'تقرير-إيرادات-كافة_بنود_الإيرادات-2026-10-01_2026-10-31-2026-10-19',
  );
  const name = R.reportFileName({ kindAr: 'مصروفات', scope: 'a/b\\c:d*e?"<>|', periodSlug: 'كامل-المدة', today: TODAY });
  assert.doesNotMatch(name, /[\\/:*?"<>|]/);
  assert.match(name, /^تقرير-مصروفات-/);
  assert.match(name, /كامل-المدة/);
  assert.ok(R.reportFileName({ kindAr: 'إيرادات', scope: 'ب'.repeat(300), periodSlug: 'x'.repeat(300), today: TODAY }).length < 120);
});

// ── presets ──────────────────────────────────────────────────────────────────

check('built-in presets: three, distinct, valid, and their periods are the ready-made ones', () => {
  const list = R.builtInPresets(TODAY);
  assert.equal(list.length, 3);
  assert.equal(new Set(list.map((p) => p.id)).size, 3);
  assert.deepEqual(list.map((p) => p.name), ['كشف تفصيلي للشهر', 'ملخص حسب البند للسنة', 'ملخص حسب الجهة']);
  for (const p of list) {
    assert.equal(p.builtIn, true);
    assert.equal(R.resolvePeriod(p.options.period, TODAY).valid, true);
    assert.deepEqual(R.sanitizeOptions(p.options, TODAY), p.options); // already clean
    assert.ok(R.describeOptions(p.options).length > 0);
  }
  assert.equal(list[0].options.layout.signature, true);
  assert.equal(list[1].options.layout.grouping, 'CATEGORY');
  assert.equal(list[2].options.layout.grouping, 'PARTY');
});

check('presets: save, read back, same name replaces, delete', () => {
  const o1 = opts({ filters: { categoryIds: ['c1', 'c2'], minAmount: '100' }, layout: { grouping: 'CATEGORY', title: 'تقرير خاص' } });
  const o2 = opts({ period: { mode: 'RANGE', from: '2026-01-01', to: '2026-03-31' } });
  let list = [];
  let r = R.upsertPreset(list, '  كشف   الربع ', o1, 'id-1');
  assert.equal(r.error, null);
  list = r.presets;
  assert.equal(list[0].name, 'كشف الربع');
  r = R.upsertPreset(list, 'ربع ثانٍ', o2, 'id-2');
  list = r.presets;
  assert.equal(list.length, 2);
  r = R.upsertPreset(list, 'كشف الربع', o2, 'id-3'); // same name: replaced, id kept
  list = r.presets;
  assert.equal(list.length, 2);
  assert.equal(list.find((p) => p.name === 'كشف الربع').id, 'id-1');
  assert.deepEqual(list.find((p) => p.name === 'كشف الربع').options, o2);
  assert.equal(R.upsertPreset(list, '   ', o1, 'x').error != null, true);
  const back = R.parsePresetStore(R.serializePresetStore(list), TODAY);
  assert.deepEqual(back.map((p) => [p.id, p.name]), list.map((p) => [p.id, p.name]));
  assert.deepEqual(back[0].options, list[0].options);
  assert.deepEqual(R.deletePreset(list, 'id-1').map((p) => p.id), ['id-2']);
  assert.equal(R.deletePreset(list, 'nope').length, 2);
});

check('sameOptions ignores order, titles and the fields of a mode that is not in use', () => {
  const a = opts({ filters: { categoryIds: ['a', 'b'], methods: ['CASH', 'CARD'] }, layout: { title: 'عنوان' } });
  const b = opts({ filters: { categoryIds: ['b', 'a'], methods: ['CARD', 'CASH'] }, layout: { title: 'غيره', subtitle: 'س' } });
  assert.equal(R.sameOptions(a, b), true);
  assert.equal(R.sameOptions(a, opts({ filters: { categoryIds: ['a'], methods: ['CASH', 'CARD'] } })), false);
  assert.equal(R.sameOptions(opts({ period: { mode: 'ALL', from: '2026-01-01' } }), opts({ period: { mode: 'ALL', from: '' } })), true);
  assert.equal(R.sameOptions(opts({ period: { mode: 'RANGE', from: '2026-01-01', to: '2026-02-01' } }), opts({ period: { mode: 'RANGE', from: '2026-01-02', to: '2026-02-01' } })), false);
  assert.equal(R.sameOptions(opts({ layout: { signature: true } }), opts()), false);
  assert.equal(R.sameOptions(opts({ filters: { minAmount: ' 5 ' } }), opts({ filters: { minAmount: '5' } })), true);
});

check('applyPreset: takes the preset but keeps the title the person already typed', () => {
  const [first] = R.builtInPresets(TODAY);
  const current = opts({ layout: { title: 'عنواني', subtitle: 'فرعي', grouping: 'PARTY' } });
  const next = R.applyPreset(current, first);
  assert.equal(next.layout.title, 'عنواني');
  assert.equal(next.layout.subtitle, 'فرعي');
  assert.equal(next.layout.grouping, first.options.layout.grouping);
  assert.equal(next.period.mode, 'QUICK');
  const own = R.applyPreset(current, { id: 'x', name: 'x', options: opts({ layout: { title: 'عنوان الإعداد' } }) });
  assert.equal(own.layout.title, 'عنوان الإعداد');
  next.filters.categoryIds.push('z');
  assert.deepEqual(first.options.filters.categoryIds, []); // the preset itself is untouched
});

check('presets: the saved copy is independent of the options object it was made from', () => {
  const o = opts({ filters: { categoryIds: ['c1'] } });
  const { presets } = R.upsertPreset([], 'نسخة', o, 'i');
  o.filters.categoryIds.push('c2');
  assert.deepEqual(presets[0].options.filters.categoryIds, ['c1']);
});

check('presets: the list is capped and the oldest go first; the name is capped', () => {
  let list = [];
  for (let i = 0; i < R.MAX_SAVED_PRESETS + 5; i++) list = R.upsertPreset(list, `إعداد ${i}`, opts(), `id${i}`).presets;
  assert.equal(list.length, R.MAX_SAVED_PRESETS);
  assert.equal(list[0].name, 'إعداد 5');
  const long = R.upsertPreset([], 'ا'.repeat(200), opts(), 'L').presets[0];
  assert.equal(long.name.length, R.PRESET_NAME_MAX);
});

check('presets: damaged, foreign or hostile stored text gives an empty list or safe options, never a throw', () => {
  for (const text of [null, undefined, '', '{', 'null', '[]', '"x"', '{"v":2,"presets":[]}', '{"v":1}', '{"v":1,"presets":"no"}']) {
    assert.deepEqual(R.parsePresetStore(text, TODAY), [], String(text));
  }
  const hostile = JSON.stringify({
    v: 1,
    presets: [
      null,
      7,
      { id: '', name: 'بلا معرف' },
      { id: 'a', name: '' },
      { id: 'builtin:x', name: 'مزيّف' },
      { id: 'dup', name: 'أول', options: {} },
      { id: 'dup', name: 'مكرر', options: {} },
      {
        id: 'ok',
        name: 'سليم',
        options: {
          period: { mode: 'WEIRD', quick: 5, year: 99999, months: [1, 'x', 13, 2, 2], from: '2026-02-30', to: 'abc' },
          filters: { categoryIds: ['a', 5, '', 'a'], methods: ['CASH', 'GOLD'], includeDrafts: 'yes', minAmount: 'zzz', maxAmount: '10' },
          layout: { grouping: 'DIAGONAL', sort: 7, includeSummaries: 'no', signature: 1, title: 'ت'.repeat(500), subtitle: {} },
        },
      },
    ],
  });
  const list = R.parsePresetStore(hostile, TODAY);
  assert.deepEqual(list.map((p) => p.id), ['dup', 'ok']);
  const o = list.find((p) => p.id === 'ok').options;
  assert.equal(o.period.mode, 'ALL');
  assert.equal(o.period.quick, 'THIS_MONTH');
  assert.equal(o.period.year, 2026);
  assert.deepEqual(o.period.months, [1, 2]);
  assert.equal(o.period.from, '');
  assert.equal(o.period.to, '');
  assert.deepEqual(o.filters.categoryIds, ['a']);
  assert.deepEqual(o.filters.methods, ['CASH']);
  assert.equal(o.filters.includeDrafts, false);
  assert.equal(o.filters.minAmount, '');
  assert.equal(o.filters.maxAmount, '10');
  assert.equal(o.layout.grouping, 'METHOD');
  assert.equal(o.layout.sort, 'DATE_DESC');
  assert.equal(o.layout.includeSummaries, false);
  assert.equal(o.layout.signature, false);
  assert.equal(o.layout.title.length, 120);
  assert.equal(o.layout.subtitle, '');
  assert.equal(R.sanitizeOptions(undefined, TODAY).layout.includeSummaries, true); // missing means the default
  assert.deepEqual(R.sanitizeOptions('junk', TODAY), R.defaultReportOptions(TODAY));
});

check('presets: built-in presets are never written to storage', () => {
  const text = R.serializePresetStore([...R.builtInPresets(TODAY), { id: 'u1', name: 'خاص', options: opts() }]);
  assert.deepEqual(JSON.parse(text).presets.map((p) => p.id), ['u1']);
});

check('presets: storage that is missing, blocked or full does not break anything', () => {
  const mem = new Map();
  const ok = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  const saved = R.upsertPreset([], 'مخزّن', opts({ filters: { methods: ['CHEQUE'] } }), 'm1').presets;
  assert.equal(R.savePresets('k', saved, ok), true);
  assert.equal(R.loadPresets('k', TODAY, ok)[0].name, 'مخزّن');
  assert.deepEqual(R.loadPresets('other', TODAY, ok), []);
  const throwing = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(R.savePresets('k', saved, throwing), false);
  assert.deepEqual(R.loadPresets('k', TODAY, throwing), []);
  assert.equal(R.savePresets('k', saved, null), false);
  assert.deepEqual(R.loadPresets('k', TODAY, null), []);
  // no window in node: the default storage is null, which is the same as «blocked»
  assert.deepEqual(R.loadPresets('k', TODAY), []);
  assert.equal(R.savePresets('k', saved), false);
});

check('activeFilterCount counts restricting filters only', () => {
  assert.equal(R.activeFilterCount(opts().filters), 0);
  assert.equal(R.activeFilterCount(opts({ filters: { categoryIds: ['a'], partyIds: ['b'], minAmount: '5', maxAmount: '9', includeDrafts: true } }).filters), 4);
});

// ── wording ──────────────────────────────────────────────────────────────────

check('categoriesLabel: every account, one, up to three by name, then a count', () => {
  const names = { a: 'إيجارات', b: 'مواقف', c: 'خدمات', d: 'غرامات' };
  const of = (id) => names[id];
  assert.equal(R.categoriesLabel([], of, 'كافة البنود'), 'كافة البنود');
  assert.equal(R.categoriesLabel(['a'], of, 'x'), 'إيجارات');
  assert.equal(R.categoriesLabel(['zzz'], of, 'x'), 'بند محدد');
  assert.equal(R.categoriesLabel(['a', 'b', 'c'], of, 'x'), 'إيجارات، مواقف، خدمات');
  assert.equal(R.categoriesLabel(['a', 'b', 'c', 'd'], of, 'x'), '4 بنود مختارة');
  assert.equal(R.categoriesLabel(['a', 'zzz'], of, 'x'), '2 بنود مختارة'); // a name that cannot be read is not printed as blank
});

check('scope note: says what was filtered and any non-default layout, and nothing when nothing was', () => {
  const base = { layout: { grouping: 'METHOD', sort: 'DATE_DESC' }, partyName: (id) => ({ p1: 'محل الأمل', p2: 'مطعم البحر' })[id], cashboxName: (id) => ({ b1: 'الخزينة النقدية' })[id] };
  assert.equal(R.buildScopeNote({ ...base, filters: opts().filters }), '');
  const note = R.buildScopeNote({
    ...base,
    filters: opts({ filters: { partyIds: ['p1', R.NO_PARTY], cashboxIds: ['b1'], methods: ['CASH', 'CHEQUE'], minAmount: '100', maxAmount: '2500.5', includeDrafts: true } }).filters,
    layout: { grouping: 'CATEGORY', sort: 'AMOUNT_DESC' },
  });
  assert.equal(note, 'الجهة: محل الأمل، بدون جهة · الخزينة: الخزينة النقدية · طريقة الدفع: نقدي، صك · المبلغ من 100 إلى 2,500.5 د.ل · تشمل المسودات · التجميع: حسب البند · الترتيب: المبلغ الأكبر أولاً');
  assert.equal(R.buildScopeNote({ ...base, filters: opts({ filters: { minAmount: '50' } }).filters }), 'المبلغ 50 د.ل فأكثر');
  assert.equal(R.buildScopeNote({ ...base, filters: opts({ filters: { maxAmount: '50' } }).filters }), 'المبلغ حتى 50 د.ل');
  assert.equal(R.buildScopeNote({ ...base, filters: opts({ filters: { minAmount: 'x' } }).filters }), ''); // a bad amount is reported in the dialog, not printed
  assert.equal(R.buildScopeNote({ ...base, filters: opts({ filters: { partyIds: ['p1', 'p2', 'p3', 'p4'] } }).filters }), 'الجهة: 4 جهات');
  assert.equal(R.buildScopeNote({ ...base, layout: { grouping: 'NONE', sort: 'DATE_ASC' }, filters: opts().filters }), 'التجميع: بدون تجميع · الترتيب: الأقدم أولاً');
});

check('pruneUnknownChoices drops what no longer exists and says how many', () => {
  const o = opts({ filters: { categoryIds: ['c1', 'gone'], partyIds: [R.NO_PARTY, 'p1', 'gone2'], cashboxIds: ['b9'] } });
  const known = { categories: new Set(['c1']), parties: new Set(['p1']), cashboxes: new Set(['b1']) };
  const r = R.pruneUnknownChoices(o, known);
  assert.equal(r.dropped, 3);
  assert.deepEqual(r.options.filters.categoryIds, ['c1']);
  assert.deepEqual(r.options.filters.partyIds, [R.NO_PARTY, 'p1']);
  assert.deepEqual(r.options.filters.cashboxIds, []);
  assert.deepEqual(r.options.layout, o.layout);
  assert.equal(R.pruneUnknownChoices(opts(), known).dropped, 0);
});

check('facet catalogs: accounts as given, parties and cashboxes from the rows, «بدون جهة» only when an entry has no party', () => {
  const rows = [
    tx({ contact: { id: 'p2', name: 'مطعم البحر', shop_number: '12' }, contact_id: 'p2' }),
    tx({ contact: { id: 'p1', name: 'محل الأمل' } }),
    tx({ contact: { id: 'p1', name: 'محل الأمل' } }),
    tx({ cashbox: { id: 'b2', name_ar: 'مصرف الواحة' }, cashbox_id: 'b2' }),
  ];
  const cats = [{ id: 'c1', name_ar: 'إيجارات', code: 'REV-RNT' }, { id: 'c2', name_ar: null, name: 'Parking', code: null }, { id: 'c3', name_ar: null, name: null, code: 'X-1' }];
  const c = R.buildFacetCatalogs(rows, cats);
  assert.deepEqual(c.category.map((x) => [x.id, x.label, x.hint]), [['c1', 'إيجارات', 'REV-RNT'], ['c2', 'Parking', undefined], ['c3', 'X-1', 'X-1']]);
  assert.equal(c.party.length, 2); // each party once
  assert.equal(c.party.find((x) => x.id === 'p2').hint, 'محل 12');
  assert.equal(c.party.some((x) => x.id === R.NO_PARTY), false);
  assert.deepEqual(c.cashbox.map((x) => x.id).sort(), ['b1', 'b2']);
  const lone = R.buildFacetCatalogs([tx({ contact: null }), tx({ contact: null, contact_id: null })], []);
  assert.deepEqual(lone.party, [{ id: R.NO_PARTY, label: 'بدون جهة' }]);
  assert.deepEqual(R.buildFacetCatalogs([], []), { category: [], party: [], cashbox: [] });
  // and the catalog plus the rows give the list a filter shows
  const items = R.facetItems(rows.slice(0, 1), 'party', c.party);
  assert.equal(items.find((x) => x.id === 'p2').count, 1);
  assert.equal(items.find((x) => x.id === 'p1').count, 0);
});

check('pruneUnknownChoices keeps the «بدون بند» and «بدون خزينة» choices', () => {
  const o = opts({ filters: { categoryIds: [R.NO_CATEGORY, 'gone'], cashboxIds: [R.NO_CASHBOX, 'b9'] } });
  const r = R.pruneUnknownChoices(o, { categories: new Set(['c1']), parties: new Set(), cashboxes: new Set(['b1']) });
  assert.equal(r.dropped, 2);
  assert.deepEqual(r.options.filters.categoryIds, [R.NO_CATEGORY]);
  assert.deepEqual(r.options.filters.cashboxIds, [R.NO_CASHBOX]);
});

check('describeOptions: the period and layout in plain words, months counted in Arabic', () => {
  const months = (list) => R.describeOptions(opts({ period: { mode: 'MONTHS', year: 2026, months: list }, layout: { grouping: 'CATEGORY', sort: 'AMOUNT_DESC', signature: true } }));
  assert.equal(months([3]), 'شهر واحد · حسب البند · المبلغ الأكبر أولاً · مع التوقيع');
  assert.match(months([3, 4]), /^شهران · /);
  assert.match(months([1, 2, 3, 4, 5]), /^5 أشهر · /);
  assert.match(months([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), /^12 شهراً · /);
  assert.equal(R.describeOptions(opts()), 'كل المدة · حسب طريقة الدفع · الأحدث أولاً');
});

check('clearFilters: every filter off, and a fresh object each time', () => {
  const a = R.clearFilters();
  assert.deepEqual(a, R.DEFAULT_FILTERS);
  assert.equal(R.activeFilterCount(a), 0);
  a.categoryIds.push('x');
  assert.deepEqual(R.clearFilters().categoryIds, []);
  assert.deepEqual(R.DEFAULT_FILTERS.categoryIds, []);
  const o = R.defaultReportOptions(TODAY);
  o.filters.methods.push('CASH');
  assert.deepEqual(R.defaultReportOptions(TODAY).filters.methods, []);
  assert.deepEqual(R.DEFAULT_FILTERS.methods, []);
});

check('group captions: payment-method grouping keeps the report\'s own caption, the others name their group', () => {
  assert.equal(R.groupCaption('REVENUE', 'METHOD'), undefined);
  assert.equal(R.groupCaption('EXPENSE', 'METHOD'), undefined);
  assert.equal(R.groupCaption('REVENUE', 'CATEGORY'), 'جدول إيرادات بند');
  assert.equal(R.groupCaption('EXPENSE', 'PARTY'), 'جدول مصروفات جهة');
  assert.equal(R.groupCaption('EXPENSE', 'CASHBOX'), 'جدول مصروفات خزينة');
  assert.equal(R.groupCaption('REVENUE', 'MONTH'), 'جدول إيرادات شهر');
  assert.equal(R.groupCaption('REVENUE', 'NONE'), 'جدول إيرادات');
  for (const g of R.GROUPING_OPTIONS) for (const k of ['REVENUE', 'EXPENSE']) assert.ok(R.groupCaption(k, g.id) === undefined || R.groupCaption(k, g.id).length > 0);
});

check('toPdfGroups: keeps the keys unique, the subtotals exact and the rows in order', () => {
  const rows = [tx({ amount: '0.1', method: 'CASH' }), tx({ amount: '0.2', method: 'CASH' }), tx({ amount: '1.0005', method: 'CHEQUE' }), tx({ amount: 'abc', method: 'CARD' })];
  const out = R.toPdfGroups(R.groupTransactions(rows, 'METHOD'));
  assert.equal(new Set(out.map((g) => g.method)).size, out.length);
  assert.deepEqual(out.map((g) => g.count), out.map((g) => g.items.length));
  const cash = out.find((g) => g.method === 'CASH');
  assert.equal(cash.totalAmount, 0.3);
  assert.equal(cash.labelAr, 'نقدي');
  assert.deepEqual(ids(cash.items), ids(rows.slice(0, 2)));
  assert.equal(out.reduce((s, g) => s + g.count, 0), rows.length);
  assert.deepEqual(R.toPdfGroups([]), []);
});

check('report kind text: revenues and expenses have their own words and storage keys', () => {
  assert.notEqual(R.REPORT_KIND_TEXT.REVENUE.storageKey, R.REPORT_KIND_TEXT.EXPENSE.storageKey);
  assert.equal(R.REPORT_KIND_TEXT.REVENUE.defaultTitle, 'كشف الإيرادات التفصيلي');
  assert.equal(R.REPORT_KIND_TEXT.EXPENSE.defaultTitle, 'كشف المصروفات التفصيلي');
  assert.equal(R.REPORT_KIND_TEXT.REVENUE.allCategories, 'كافة بنود الإيرادات');
});

check('print stamp: Tripoli\'s clock (UTC+2, no daylight saving), zero-padded, midnight is 00', () => {
  assert.equal(R.formatPrintStamp(new Date('2026-10-19T14:08:00Z')), '19/10/2026 16:08');
  assert.equal(R.formatPrintStamp(new Date('2026-10-19T22:00:00Z')), '20/10/2026 00:00'); // already tomorrow in Tripoli
  assert.equal(R.formatPrintStamp(new Date('2026-12-31T21:59:00Z')), '31/12/2026 23:59');
  assert.equal(R.formatPrintStamp(new Date('2026-01-05T07:05:00Z')), '05/01/2026 09:05');
  assert.equal(R.formatPrintStamp(new Date('2028-02-28T22:30:00Z')), '29/02/2028 00:30'); // leap day
  assert.match(R.formatPrintStamp(), /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
});

console.log(`\n✓ verify-report-options: ${passed} checks passed`);
