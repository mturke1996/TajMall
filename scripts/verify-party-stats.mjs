/**
 * What a contact's counted transactions add up to: totals in and out, last payment, the usual month, the
 * twelve-month series, the split by account, and which side a profile leads with.
 *   npx tsx scripts/verify-party-stats.mjs
 */
import assert from 'node:assert/strict';

const ps = await import('../src/lib/people/party-stats.ts');
const { partyInitials } = await import('../src/lib/people/party-initials.ts');
const { buildPartyStats, primaryDirection, sideOf, groupAccounts, last12MonthKeys, directionOfKind, UNCATEGORIZED_NAME } = ps;

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const ASOF = '2026-10-19';
let seq = 0;
const cat = (code, name, id = `cat-${code}`) => ({ id, code, name_ar: name });
const tx = (kind, amount, date, category = null, over = {}) => ({ id: `t${++seq}`, kind, status: 'POSTED', amount: String(amount), tx_date: date, category, ...over });
const ELC = cat('EXP-ELC', 'كهرباء');
const RNT = cat('EXP-RNT', 'إيجار مؤجرين');
const stats = (rows) => buildPartyStats(rows, { asOf: ASOF });

check('a contact with nothing: zeros everywhere, a full empty series, no dates', () => {
  const s = stats([]);
  for (const side of [s.in, s.out]) {
    assert.deepEqual([side.total, side.count, side.activeMonths, side.averagePerActiveMonth], [0, 0, 0, 0]);
    assert.equal(side.last, null);
    assert.equal(side.first, null);
    assert.equal(side.series.length, 12);
    assert.ok(side.series.every((p) => p.amount === 0 && p.count === 0));
    assert.deepEqual(side.accounts, []);
  }
  assert.deepEqual([s.count, s.firstDate, s.lastDate, s.net], [0, null, null, 0]);
});

check('a vendor paid ten times: totals, last payment, average per active month', () => {
  const rows = Array.from({ length: 10 }, (_, i) => tx('EXPENSE', 1000 + i * 100, `2026-0${(i % 9) + 1}-1${i % 9}`, ELC));
  const s = stats(rows);
  assert.equal(s.out.count, 10);
  assert.equal(s.out.total, rows.reduce((a, r) => a + Number(r.amount), 0));
  assert.equal(s.in.total, 0);
  assert.equal(s.out.activeMonths, 9, 'January to September, and a second payment in January');
  assert.equal(s.out.averagePerActiveMonth, Math.round((s.out.total / 9) * 1000) / 1000);
  assert.equal(s.net, -s.out.total);
  assert.deepEqual(s.out.last, { id: rows[8].id, date: '2026-09-18', amount: 1800 });
  assert.equal(s.out.first.date, '2026-01-10');
  assert.equal(s.firstDate, '2026-01-10');
  assert.equal(s.lastDate, '2026-09-18');
});

check('the last payment is the latest date whatever the order of the rows', () => {
  const a = tx('EXPENSE', 10, '2026-08-01');
  const b = tx('EXPENSE', 20, '2026-09-30');
  const c = tx('EXPENSE', 30, '2026-07-15');
  const s = stats([b, c, a]);
  assert.equal(s.out.last.id, b.id);
  assert.equal(s.out.first.id, c.id);
  assert.equal(stats([a, b, c]).out.last.id, b.id);
});

check('twelve-month series: the twelve months ending with this one, zeros kept, older money not in it', () => {
  const s = stats([tx('REVENUE', 100, '2026-10-01'), tx('REVENUE', 50, '2026-10-18'), tx('REVENUE', 70, '2025-11-30'), tx('REVENUE', 999, '2025-10-31')]);
  const keys = s.in.series.map((p) => p.monthKey);
  assert.equal(keys[0], '2025-11');
  assert.equal(keys[11], '2026-10');
  assert.equal(new Set(keys).size, 12);
  assert.deepEqual(s.in.series[11], { monthKey: '2026-10', amount: 150, count: 2 });
  assert.deepEqual(s.in.series[0], { monthKey: '2025-11', amount: 70, count: 1 });
  assert.equal(s.in.series[5].amount, 0);
  // older money is still in the totals
  assert.equal(s.in.total, 100 + 50 + 70 + 999);
  assert.equal(s.in.count, 4);
  assert.equal(s.in.activeMonths, 3);
});

check('the series window moves with asOf and crosses a year end', () => {
  assert.deepEqual(last12MonthKeys('2026-01-31').slice(0, 2), ['2025-02', '2025-03']);
  assert.equal(last12MonthKeys('2026-01-31')[11], '2026-01');
  assert.equal(last12MonthKeys('2026-12-01')[0], '2026-01');
  assert.equal(last12MonthKeys('nonsense').length, 12);
  const s = buildPartyStats([tx('EXPENSE', 5, '2026-01-02')], { asOf: '2026-01-31' });
  assert.equal(s.out.series[11].amount, 5);
});

check('only counted rows: reconciled counts, drafts, voided and rows with no status do not', () => {
  const s = stats([
    tx('EXPENSE', 100, '2026-09-01'),
    tx('EXPENSE', 200, '2026-09-02', null, { status: 'RECONCILED' }),
    tx('EXPENSE', 400, '2026-09-03', null, { status: 'DRAFT' }),
    tx('EXPENSE', 800, '2026-09-04', null, { status: 'VOIDED' }),
    tx('EXPENSE', 1600, '2026-09-05', null, { status: undefined }),
  ]);
  assert.equal(s.out.total, 300);
  assert.equal(s.out.count, 2);
});

check('only money in and money out: transfers, openings and adjustments are left out', () => {
  const s = stats([tx('TRANSFER', 100, '2026-09-01'), tx('OPENING', 100, '2026-09-01'), tx('ADJUSTMENT', 100, '2026-09-01'), tx(null, 100, '2026-09-01'), tx('REVENUE', 7, '2026-09-01')]);
  assert.equal(s.count, 1);
  assert.equal(s.in.total, 7);
  assert.equal(s.out.total, 0);
  assert.equal(directionOfKind('REVENUE'), 'in');
  assert.equal(directionOfKind('EXPENSE'), 'out');
  assert.equal(directionOfKind('TRANSFER'), null);
});

check('amounts: strings, decimals, junk, zero and negative', () => {
  const s = stats([tx('EXPENSE', '250.125', '2026-09-01'), tx('EXPENSE', 'abc', '2026-09-01'), tx('EXPENSE', null, '2026-09-01', null, { amount: null }), tx('EXPENSE', 0, '2026-09-01'), tx('EXPENSE', -50, '2026-09-01'), tx('EXPENSE', 0.1, '2026-09-02'), tx('EXPENSE', 0.2, '2026-09-02')]);
  assert.equal(s.out.count, 3);
  assert.equal(s.out.total, 250.425, 'sums are rounded to three decimals, no float dust');
});

check('rows with no usable date are skipped; a timestamp is read by its day', () => {
  const s = stats([tx('EXPENSE', 5, ''), tx('EXPENSE', 5, 'x'), tx('EXPENSE', 5, null, null, { tx_date: null }), tx('EXPENSE', 9, '2026-09-30T22:30:00+00:00')]);
  assert.equal(s.out.count, 1);
  assert.equal(s.out.last.date, '2026-09-30');
});

check('both directions on one contact', () => {
  const s = stats([tx('REVENUE', 500, '2026-09-01'), tx('EXPENSE', 120, '2026-09-10'), tx('REVENUE', 300, '2026-10-02')]);
  assert.equal(s.in.total, 800);
  assert.equal(s.out.total, 120);
  assert.equal(s.count, 3);
  assert.equal(s.net, 680);
  assert.equal(s.firstDate, '2026-09-01');
  assert.equal(s.lastDate, '2026-10-02');
});

check('accounts: biggest first, shares add up, rows with no category share one slice', () => {
  const s = stats([
    tx('EXPENSE', 300, '2026-09-01', ELC),
    tx('EXPENSE', 100, '2026-09-02', ELC),
    tx('EXPENSE', 500, '2026-09-03', RNT),
    tx('EXPENSE', 100, '2026-09-04'),
    tx('EXPENSE', 0.001, '2026-09-04', null, { category: {} }),
  ]);
  const a = s.out.accounts;
  assert.deepEqual(a.map((x) => x.name), ['إيجار مؤجرين', 'كهرباء', UNCATEGORIZED_NAME]);
  assert.deepEqual(a.map((x) => x.total), [500, 400, 100.001]);
  assert.deepEqual(a.map((x) => x.count), [1, 2, 2]);
  assert.ok(Math.abs(a.reduce((sum, x) => sum + x.share, 0) - 100) < 1e-9);
  assert.equal(a[0].code, 'EXP-RNT');
  assert.equal(a[2].code, null);
});

check('accounts grouped: the biggest few and one slice for the rest, shares still add up', () => {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) => tx('EXPENSE', 700 - i * 100, '2026-09-01', cat(`C-${n}`, `بند ${n}`)));
  const side = stats(rows).out;
  assert.equal(side.accounts.length, 7);
  const g = groupAccounts(side.accounts, { top: 3 });
  assert.equal(g.length, 4);
  assert.deepEqual(g.map((x) => x.name).slice(0, 3), ['بند A', 'بند B', 'بند C']);
  const rest = g[3];
  assert.equal(rest.rest, true);
  assert.equal(rest.name, 'بنود أخرى');
  assert.equal(rest.count, 4);
  assert.equal(rest.total, 400 + 300 + 200 + 100);
  assert.ok(Math.abs(g.reduce((sum, x) => sum + x.share, 0) - 100) < 1e-9);
  assert.equal(g.reduce((sum, x) => sum + x.total, 0), side.total);
  // few accounts: left as they are
  assert.equal(groupAccounts(side.accounts.slice(0, 3), { top: 5 }).length, 3);
  assert.equal(groupAccounts(side.accounts, { top: 3, restName: 'غير ذلك' })[3].name, 'غير ذلك');
  assert.deepEqual(groupAccounts([]), []);
});

// ---- which side a profile leads with ----

check('direction: landlords, vendors, employees are paid; customers and tenants pay', () => {
  assert.equal(primaryDirection({ kind: 'VENDOR', notes: '[role:landlord]' }), 'out');
  assert.equal(primaryDirection({ kind: 'CUSTOMER', notes: '[role:landlord]' }), 'out', 'a landlord filed under customers is still paid');
  assert.equal(primaryDirection({ kind: 'VENDOR', notes: '' }), 'out');
  assert.equal(primaryDirection({ kind: 'EMPLOYEE', notes: '' }), 'out');
  assert.equal(primaryDirection({ kind: 'CUSTOMER', notes: '' }), 'in');
  assert.equal(primaryDirection({ kind: 'TENANT', notes: '' }), 'in');
});

check('direction: the data has the last word when the role finds nothing on its side', () => {
  // an unlabelled landlord or a utility filed under customers: only ever paid
  const paidOnly = stats([tx('EXPENSE', 25000, '2026-07-30', RNT)]);
  assert.equal(primaryDirection({ kind: 'CUSTOMER', notes: '' }, paidOnly), 'out');
  // a customer with revenue keeps leading with it
  const received = stats([tx('REVENUE', 100, '2026-07-30'), tx('EXPENSE', 5, '2026-07-31')]);
  assert.equal(primaryDirection({ kind: 'CUSTOMER', notes: '' }, received), 'in');
  // a vendor that only ever paid us
  assert.equal(primaryDirection({ kind: 'VENDOR', notes: '' }, stats([tx('REVENUE', 3, '2026-07-30')])), 'in');
  // nothing at all: the role decides
  assert.equal(primaryDirection({ kind: 'CUSTOMER', notes: '' }, stats([])), 'in');
  assert.equal(primaryDirection({ kind: 'VENDOR', notes: '' }, stats([])), 'out');
});

check('direction: an unclassified party leads with the bigger side', () => {
  assert.equal(primaryDirection({ kind: 'OTHER', notes: '' }, stats([tx('REVENUE', 900, '2026-07-30'), tx('EXPENSE', 100, '2026-07-30')])), 'in');
  assert.equal(primaryDirection({ kind: 'OTHER', notes: '' }, stats([tx('REVENUE', 100, '2026-07-30'), tx('EXPENSE', 900, '2026-07-30')])), 'out');
  assert.equal(primaryDirection(null), 'out');
  assert.equal(primaryDirection(undefined, stats([])), 'out');
});

check('sideOf picks the side', () => {
  const s = stats([tx('REVENUE', 3, '2026-07-30'), tx('EXPENSE', 4, '2026-07-30')]);
  assert.equal(sideOf(s, 'in').total, 3);
  assert.equal(sideOf(s, 'out').total, 4);
  assert.equal(sideOf(s, 'in').direction, 'in');
});

check('the water utility and the electricity company of the real data', () => {
  const water = stats([tx('EXPENSE', 800, '2026-08-10', cat('EXP-WTR', 'مياه'))]);
  assert.equal(water.out.accounts[0].name, 'مياه');
  assert.equal(primaryDirection({ kind: 'CUSTOMER', notes: '' }, water), 'out');
  const rows = Array.from({ length: 10 }, (_, i) => tx('EXPENSE', 3000, `2026-0${(i % 9) + 1}-05`, ELC));
  const elc = stats(rows);
  assert.equal(elc.out.count, 10);
  assert.equal(elc.out.accounts.length, 1);
  assert.equal(elc.out.accounts[0].share, 100);
});

check('nothing it was given is changed', () => {
  const rows = Object.freeze([Object.freeze(tx('EXPENSE', 5, '2026-09-02', Object.freeze(cat('X', 'س')))), Object.freeze(tx('REVENUE', 7, '2026-09-01'))]);
  const before = JSON.stringify(rows);
  stats(rows);
  assert.equal(JSON.stringify(rows), before);
});

check('avatar letters: the first two words that say who it is, without «شركة» or «ال»', () => {
  assert.equal(partyInitials('شركة الأفق للاستثمار العقاري'), 'أ ع');
  assert.equal(partyInitials('محمد المبروك الطاهر'), 'م م');
  assert.equal(partyInitials('الشركة العامة للكهرباء'), 'ل');
  assert.equal(partyInitials('مصنع الصفا'), 'ص');
  assert.equal(partyInitials('مُحَمَّد علي'), 'م ع', 'diacritics and tatweel are ignored');
  assert.equal(partyInitials('Al Ofoq Real Estate'), 'A O');
  assert.equal(partyInitials('john smith'), 'J S');
  assert.equal(partyInitials('شركة'), 'ش', 'a name made only of generic words still gets a letter');
  assert.equal(partyInitials('  '), '');
  assert.equal(partyInitials(''), '');
  assert.equal(partyInitials(null), '');
  assert.equal(partyInitials(undefined), '');
  assert.equal(partyInitials('(  ) - /'), '');
});

console.log(`\n✓ verify-party-stats: ${passed} checks passed`);
