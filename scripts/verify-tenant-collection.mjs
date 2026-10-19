/**
 * Collecting from the tenants list: what a row still owes, the orders the list can take (and the one a
 * filter implies), and what the WhatsApp reminder says its amount is for.
 *   npx tsx scripts/verify-tenant-collection.mjs
 */
import assert from 'node:assert/strict';

const { tenantOwed, defaultTenantSort, nextTenantSort, sortTenants, describeTenantSort, reminderBasisFor, periodIsDue } = await import('../src/lib/tenant-collection.ts');
const { buildRentReminderMessage } = await import('../src/lib/whatsapp.ts');
const { formatMoney } = await import('../src/lib/utils.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const row = (name, shop, status, amount, paid, extra = {}) => ({
  id: name,
  name,
  shop_number: shop,
  monthly_rent: amount == null ? null : String(amount),
  current_month_status: status,
  current_month_amount: amount == null ? null : String(amount),
  current_month_paid: String(paid),
  ...extra,
});
const names = (rows) => rows.map((r) => r.name);

// ── what a row owes ─────────────────────────────────────────────────────────
check('an unpaid month owes its whole rent', () => {
  assert.equal(tenantOwed(row('أ', '1', 'unpaid', 1200, 0)), 1200);
});

check('a part-paid month owes the rest, to the exact fraction', () => {
  assert.equal(tenantOwed(row('أ', '1', 'paid_partial', 1200, 450.5)), 749.5);
  // float noise is rounded away at three decimals
  assert.equal(tenantOwed(row('أ', '1', 'paid_partial', 0.3, 0.1)), 0.2);
});

check('a paid, excluded or unpriced row owes nothing, whatever the numbers say', () => {
  assert.equal(tenantOwed(row('أ', '1', 'paid_full', 1200, 1200)), 0);
  assert.equal(tenantOwed(row('أ', '1', 'paid_full', 1200, 0)), 0);
  assert.equal(tenantOwed(row('أ', '1', 'exempt', 1200, 0)), 0);
  assert.equal(tenantOwed(row('أ', '1', 'no_rent_set', 0, 0)), 0);
});

check('more paid than due never gives a negative debt', () => {
  assert.equal(tenantOwed(row('أ', '1', 'paid_partial', 1000, 1300)), 0);
});

check('a month without a charge falls back to the contact rent, as the list does', () => {
  assert.equal(tenantOwed({ current_month_status: 'unpaid', current_month_amount: null, current_month_paid: '0', monthly_rent: '800' }), 800);
  assert.equal(tenantOwed({ current_month_status: 'unpaid', current_month_amount: '0', current_month_paid: '0', monthly_rent: '800' }), 800);
});

check('missing or junk numbers read as zero instead of NaN', () => {
  assert.equal(tenantOwed({ current_month_status: 'unpaid' }), 0);
  assert.equal(tenantOwed({ current_month_status: 'unpaid', current_month_amount: 'abc', current_month_paid: undefined, monthly_rent: null }), 0);
  assert.equal(tenantOwed({ current_month_status: null }), 0);
});

// ── order ───────────────────────────────────────────────────────────────────
const rows = [
  row('سالم', '12', 'unpaid', 1000, 0),
  row('باسم', '9', 'paid_partial', 2000, 500),
  row('ياسر', null, 'unpaid', 3000, 0),
  row('أحمد', '104', 'paid_full', 1500, 1500),
  row('خالد', '9', 'unpaid', 1500, 0),
];

check('by name: Arabic alphabetical, either way', () => {
  assert.deepEqual(names(sortTenants(rows, { key: 'name', dir: 'asc' })), ['أحمد', 'باسم', 'خالد', 'سالم', 'ياسر']);
  assert.deepEqual(names(sortTenants(rows, { key: 'name', dir: 'desc' })), ['ياسر', 'سالم', 'خالد', 'باسم', 'أحمد']);
});

check('by shop: numbers compare as numbers, ties by name, no-shop last in both directions', () => {
  assert.deepEqual(names(sortTenants(rows, { key: 'shop', dir: 'asc' })), ['باسم', 'خالد', 'سالم', 'أحمد', 'ياسر']);
  assert.deepEqual(names(sortTenants(rows, { key: 'shop', dir: 'desc' })), ['أحمد', 'سالم', 'باسم', 'خالد', 'ياسر']);
});

check('by owed: most owed first, ties by name, settled rows at the end', () => {
  // ياسر 3000, باسم 1500, خالد 1500, سالم 1000, أحمد 0
  assert.deepEqual(names(sortTenants(rows, { key: 'owed', dir: 'desc' })), ['ياسر', 'باسم', 'خالد', 'سالم', 'أحمد']);
  assert.deepEqual(names(sortTenants(rows, { key: 'owed', dir: 'asc' })), ['أحمد', 'سالم', 'باسم', 'خالد', 'ياسر']);
});

check('sorting returns a new array and leaves the input alone', () => {
  const before = names(rows);
  const out = sortTenants(rows, { key: 'owed', dir: 'desc' });
  assert.notEqual(out, rows);
  assert.deepEqual(names(rows), before);
  assert.deepEqual(sortTenants([], { key: 'name', dir: 'asc' }), []);
});

check('a blank shop number counts as missing, not as a small number', () => {
  const r = [row('أ', '  ', 'unpaid', 1, 0), row('ب', '3', 'unpaid', 1, 0)];
  assert.deepEqual(names(sortTenants(r, { key: 'shop', dir: 'asc' })), ['ب', 'أ']);
});

check('a debtors filter opens on the most owed; any other filter on the name', () => {
  for (const f of ['unpaid', 'paid_partial', 'partial_unpaid']) assert.deepEqual(defaultTenantSort(f), { key: 'owed', dir: 'desc' });
  for (const f of ['ALL', 'paid_full', 'exempt', 'no_rent_set', '', 'something-else']) assert.deepEqual(defaultTenantSort(f), { key: 'name', dir: 'asc' });
});

check('a click flips the same column and starts a new one at its natural end', () => {
  assert.deepEqual(nextTenantSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });
  assert.deepEqual(nextTenantSort({ key: 'name', dir: 'desc' }, 'name'), { key: 'name', dir: 'asc' });
  assert.deepEqual(nextTenantSort({ key: 'name', dir: 'desc' }, 'owed'), { key: 'owed', dir: 'desc' });
  assert.deepEqual(nextTenantSort({ key: 'owed', dir: 'desc' }, 'shop'), { key: 'shop', dir: 'asc' });
  assert.deepEqual(nextTenantSort({ key: 'owed', dir: 'desc' }, 'owed'), { key: 'owed', dir: 'asc' });
});

check('every order has a sentence for a screen reader', () => {
  const seen = new Set();
  for (const key of ['name', 'shop', 'owed']) {
    for (const dir of ['asc', 'desc']) {
      const text = describeTenantSort({ key, dir });
      assert.ok(text.startsWith('مرتبة'));
      seen.add(text);
    }
  }
  assert.equal(seen.size, 6);
});

// ── a reminder only for rent that is due ───────────────────────────────────
check('a period whose months have all come due may be reminded; one reaching past this month may not', () => {
  assert.equal(periodIsDue(['2026-10'], '2026-10'), true); // the current month is due
  assert.equal(periodIsDue(['2026-09'], '2026-10'), true);
  assert.equal(periodIsDue(['2026-01', '2026-02', '2026-10'], '2026-10'), true); // "up to now"
  assert.equal(periodIsDue(['2026-11'], '2026-10'), false); // next month is not due yet
  assert.equal(periodIsDue(['2026-10', '2026-11', '2026-12'], '2026-10'), false); // a quarter that ends later
  assert.equal(periodIsDue(['2027-01'], '2026-12'), false); // across the year boundary
  assert.equal(periodIsDue(['2025-12'], '2026-01'), true);
});

check('an empty period is never due: there is nothing to remind about', () => {
  assert.equal(periodIsDue([], '2026-10'), false);
});

// ── the reminder ────────────────────────────────────────────────────────────
const base = { tenantName: 'محمد علي', amountOutstanding: 1250.5, shopNumber: '12' };

check('reminder basis follows the period mode', () => {
  assert.deepEqual(reminderBasisFor('month', 'أكتوبر 2026'), { kind: 'month', label: 'أكتوبر 2026' });
  for (const mode of ['ytd', 'quarter', 'half', 'year']) assert.equal(reminderBasisFor(mode, 'يناير – ديسمبر 2026').kind, 'period');
});

check('a month reminder names the month, the shop and the exact amount', () => {
  const msg = buildRentReminderMessage({ ...base, basis: { kind: 'month', label: 'أكتوبر 2026' }, asOf: '19 أكتوبر 2026' });
  assert.ok(msg.includes('السيد/ة محمد علي،'));
  assert.ok(msg.includes('من إيجار شهر أكتوبر 2026'));
  assert.ok(msg.includes('للمحل رقم 12'));
  assert.ok(msg.includes(formatMoney(1250.5, 'LYD')));
  assert.ok(msg.includes('حتى تاريخ 19 أكتوبر 2026'));
  assert.ok(msg.endsWith('إدارة تاج مول'));
});

check('a period reminder says it is for the period, and all-unpaid says so', () => {
  const period = buildRentReminderMessage({ ...base, basis: { kind: 'period', label: 'يناير – أكتوبر 2026' } });
  assert.ok(period.includes('من إيجار الفترة (يناير – أكتوبر 2026)'));
  assert.ok(!period.includes('حتى تاريخ'));
  const all = buildRentReminderMessage({ ...base, basis: { kind: 'all' } });
  assert.ok(all.includes('من إيجار كل الأشهر غير المسدّدة'));
  assert.ok(all.includes(formatMoney(1250.5, 'LYD')));
});

check('no shop number: the sentence simply omits it', () => {
  const msg = buildRentReminderMessage({ ...base, shopNumber: null, basis: { kind: 'month', label: 'أكتوبر 2026' } });
  assert.ok(!msg.includes('للمحل'));
  assert.ok(!msg.includes('null'));
});

check('without a basis the message is the one every other screen already sends', () => {
  const msg = buildRentReminderMessage({ ...base, asOf: '19 أكتوبر 2026' });
  assert.ok(msg.includes('نود تذكيركم بوجود مستحقات إيجار للمحل رقم 12 بقيمة'));
  assert.ok(msg.includes('حتى تاريخ 19 أكتوبر 2026.'));
  assert.ok(!msg.includes('من إيجار'));
});

check('the figure in a reminder is the exact one shown, never rounded to a whole', () => {
  const msg = buildRentReminderMessage({ ...base, amountOutstanding: 749.5, basis: { kind: 'month', label: 'أكتوبر 2026' } });
  assert.ok(msg.includes(formatMoney(749.5, 'LYD')));
  assert.ok(msg.includes('749.5'));
});

console.log(`\n${passed} checks passed`);
