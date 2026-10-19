/**
 * The logic behind the people lists: which list a contact belongs to (landlords live under customers whatever
 * their kind), the role filters of each list, twelve months of money for every contact from one read, the
 * totals above a list and the order of its rows.
 *   npx tsx scripts/verify-directory-stats.mjs
 */
import assert from 'node:assert/strict';

const d = await import('../src/lib/contacts/directory.ts');
const { buildPartyStats, primaryDirection } = await import('../src/lib/people/party-stats.ts');
const {
  segmentOfContact,
  inSegment,
  roleChipsFor,
  normalizeRoleFilter,
  matchesRoleFilter,
  segmentCountsOf,
  roleCountsOf,
  buildDirectoryActivity,
  activityWindowStart,
  listDirection,
  buildDirectoryRows,
  filterDirectoryRows,
  sortDirectoryRows,
  summarizeDirectory,
  contactDetail,
  NO_ACTIVITY,
  DEFAULT_SORT,
  defaultDirOf,
} = d;

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const ASOF = '2026-10-19';
let seq = 0;
const contact = (over = {}) => ({
  id: `c${++seq}`,
  code: null,
  kind: 'VENDOR',
  name: `جهة ${seq}`,
  name_en: null,
  phone: null,
  phone2: null,
  email: null,
  address: null,
  shop_number: null,
  floor: null,
  monthly_rent: null,
  job_title: null,
  department: null,
  notes: null,
  is_active: true,
  ...over,
});
const row = (contact_id, kind, amount, tx_date, over = {}) => ({ contact_id, kind, status: 'POSTED', amount: String(amount), tx_date, category: null, ...over });
const RENT = { code: 'EXP-RNT' };

// ------------------------------------------------------------ which list

check('tenants and employees follow their kind; other kinds are only in the all-people list', () => {
  assert.equal(segmentOfContact(contact({ kind: 'TENANT' })), 'TENANT');
  assert.equal(segmentOfContact(contact({ kind: 'EMPLOYEE' })), 'EMPLOYEE');
  assert.equal(segmentOfContact(contact({ kind: 'OTHER' })), 'OTHER');
  assert.equal(inSegment(contact({ kind: 'OTHER' }), 'all'), true);
  assert.equal(inSegment(contact({ kind: 'OTHER' }), 'VENDOR'), false);
});

check('a landlord is under customers whether its file is a vendor or a customer', () => {
  const vendorLandlord = contact({ kind: 'VENDOR', notes: '[role:landlord]' });
  const customerLandlord = contact({ kind: 'CUSTOMER', notes: '[role:landlord]' });
  assert.equal(segmentOfContact(vendorLandlord), 'CUSTOMER');
  assert.equal(segmentOfContact(customerLandlord), 'CUSTOMER');
  assert.equal(inSegment(vendorLandlord, 'VENDOR'), false);
  assert.equal(inSegment(vendorLandlord, 'CUSTOMER'), true);
});

check('the tag is read in any spelling, and the older vendor rules still make a landlord', () => {
  assert.equal(segmentOfContact(contact({ kind: 'VENDOR', notes: 'ملاحظة\r\n[ Role : LANDLORD ]' })), 'CUSTOMER');
  assert.equal(segmentOfContact(contact({ kind: 'VENDOR', monthly_rent: '25000' })), 'CUSTOMER');
  assert.equal(segmentOfContact(contact({ kind: 'VENDOR', job_title: 'مؤجر' })), 'CUSTOMER');
  assert.equal(segmentOfContact(contact({ kind: 'VENDOR', notes: '[role:supplier_electricity]' })), 'VENDOR');
  assert.equal(segmentOfContact(contact({ kind: 'VENDOR' })), 'VENDOR');
});

check('segment counts: active files only, landlords counted once and under customers', () => {
  const list = [
    contact({ kind: 'TENANT' }),
    contact({ kind: 'TENANT', is_active: false }),
    contact({ kind: 'EMPLOYEE' }),
    contact({ kind: 'VENDOR' }),
    contact({ kind: 'VENDOR', notes: '[role:landlord]' }),
    contact({ kind: 'CUSTOMER' }),
    contact({ kind: 'OTHER' }),
  ];
  assert.deepEqual(segmentCountsOf(list), { all: 6, TENANT: 1, EMPLOYEE: 1, VENDOR: 1, CUSTOMER: 2 });
  assert.deepEqual(segmentCountsOf([]), { all: 0, TENANT: 0, EMPLOYEE: 0, VENDOR: 0, CUSTOMER: 0 });
});

// ------------------------------------------------------------ role filters

check('each list offers its own role filters', () => {
  assert.deepEqual(roleChipsFor('VENDOR').map((c) => c.id), ['ALL', 'SUPPLIER_ELECTRICITY', 'SUPPLIER_WATER', 'SUPPLIER_GOODS', 'SERVICE_PROVIDER']);
  assert.deepEqual(roleChipsFor('CUSTOMER').map((c) => c.id), ['ALL', 'LANDLORD', 'CUSTOMER']);
  assert.ok(roleChipsFor('all').some((c) => c.id === 'LANDLORD'));
  assert.deepEqual(roleChipsFor('TENANT'), []);
  assert.deepEqual(roleChipsFor('EMPLOYEE'), []);
  assert.equal(roleChipsFor('CUSTOMER')[1].label, 'مؤجرون');
});

check('a role from the address bar is safe: stale, unknown or empty become ALL', () => {
  assert.equal(normalizeRoleFilter('CUSTOMER', 'LANDLORD'), 'LANDLORD');
  assert.equal(normalizeRoleFilter('all', 'landlord'), 'LANDLORD');
  assert.equal(normalizeRoleFilter('VENDOR', 'LANDLORD'), 'ALL'); // landlords are not in the vendors list
  assert.equal(normalizeRoleFilter('CUSTOMER', 'SUPPLIER_WATER'), 'ALL');
  assert.equal(normalizeRoleFilter('TENANT', 'LANDLORD'), 'ALL');
  assert.equal(normalizeRoleFilter('all', 'NOPE'), 'ALL');
  assert.equal(normalizeRoleFilter('all', ''), 'ALL');
  assert.equal(normalizeRoleFilter('all', null), 'ALL');
  assert.equal(normalizeRoleFilter('all', undefined), 'ALL');
  assert.equal(normalizeRoleFilter('all', '  Landlord '), 'LANDLORD');
});

check('the landlord filter follows the tag, not the kind; the customer filter leaves landlords out', () => {
  const vendorLandlord = contact({ kind: 'VENDOR', notes: '[role:landlord]' });
  const customerLandlord = contact({ kind: 'CUSTOMER', notes: '[role:landlord]' });
  const plain = contact({ kind: 'CUSTOMER' });
  const tenantWithTag = contact({ kind: 'TENANT', notes: '[role:landlord]' });
  assert.equal(matchesRoleFilter(vendorLandlord, 'LANDLORD'), true);
  assert.equal(matchesRoleFilter(customerLandlord, 'LANDLORD'), true);
  assert.equal(matchesRoleFilter(plain, 'LANDLORD'), false);
  assert.equal(matchesRoleFilter(tenantWithTag, 'LANDLORD'), false);
  assert.equal(matchesRoleFilter(customerLandlord, 'CUSTOMER'), false);
  assert.equal(matchesRoleFilter(plain, 'CUSTOMER'), true);
  assert.equal(matchesRoleFilter(plain, 'ALL'), true);
});

check('role counts for a list: inactive files stay out unless asked for', () => {
  const list = [
    contact({ kind: 'CUSTOMER' }),
    contact({ kind: 'CUSTOMER', notes: '[role:landlord]' }),
    contact({ kind: 'VENDOR', notes: '[role:landlord]' }),
    contact({ kind: 'CUSTOMER', is_active: false }),
    contact({ kind: 'VENDOR' }),
  ];
  const active = roleCountsOf(list, 'CUSTOMER');
  assert.deepEqual([active.get('ALL'), active.get('LANDLORD'), active.get('CUSTOMER')], [3, 2, 1]);
  const all = roleCountsOf(list, 'CUSTOMER', true);
  assert.deepEqual([all.get('ALL'), all.get('LANDLORD'), all.get('CUSTOMER')], [4, 2, 2]);
});

// ------------------------------------------------------------ twelve months of money

check('the window is the twelve months ending with this one', () => {
  assert.equal(activityWindowStart(ASOF), '2025-11-01');
  assert.equal(activityWindowStart('2026-01-05'), '2025-02-01');
});

check('money is counted by direction into totals, a twelve-point series and the latest day', () => {
  const rows = [
    row('a', 'EXPENSE', 25000, '2026-07-30'),
    row('a', 'EXPENSE', 27000, '2026-07-30'),
    row('a', 'EXPENSE', 52000, '2026-08-31'),
    row('a', 'REVENUE', 100, '2026-09-02'),
  ];
  const act = buildDirectoryActivity(rows, { asOf: ASOF }).get('a');
  assert.equal(act.out.total, 104000);
  assert.equal(act.out.count, 3);
  assert.equal(act.in.total, 100);
  assert.equal(act.count, 4);
  assert.equal(act.out.series.length, 12);
  assert.equal(act.out.series[11 - 3], 52000); // July: three months before October
  assert.equal(act.out.series[11 - 2], 52000); // August
  assert.equal(act.out.series[11], 0);
  assert.deepEqual(act.out.last, { date: '2026-08-31', amount: 52000 });
  assert.deepEqual(act.in.last, { date: '2026-09-02', amount: 100 });
});

check('two payments on the last day add up to what that day paid', () => {
  const rows = [row('a', 'EXPENSE', 25000, '2026-08-31'), row('a', 'EXPENSE', 27000, '2026-08-31'), row('a', 'EXPENSE', 9000, '2026-08-15')];
  assert.deepEqual(buildDirectoryActivity(rows, { asOf: ASOF }).get('a').out.last, { date: '2026-08-31', amount: 52000 });
});

check('only counted rows of money in or out inside the window count', () => {
  const rows = [
    row('a', 'EXPENSE', 100, '2026-09-01', { status: 'DRAFT' }),
    row('a', 'EXPENSE', 100, '2026-09-01', { status: 'VOID' }),
    row('a', 'EXPENSE', 100, '2026-09-01', { status: null }),
    row('a', 'EXPENSE', 40, '2026-09-01', { status: 'RECONCILED' }),
    row('a', 'TRANSFER', 100, '2026-09-01'),
    row('a', 'ADJUSTMENT', 100, '2026-09-01'),
    row('a', 'EXPENSE', 0, '2026-09-01'),
    row('a', 'EXPENSE', -5, '2026-09-01'),
    row('a', 'EXPENSE', 'abc', '2026-09-01'),
    row('a', 'EXPENSE', null, '2026-09-01'),
    row('a', 'EXPENSE', 100, 'not a date'),
    row('a', 'EXPENSE', 100, ''),
    row('a', 'EXPENSE', 100, '2025-10-31'), // the month before the window
    row('a', 'EXPENSE', 100, '2026-11-01'), // a month that has not come
    row(null, 'EXPENSE', 100, '2026-09-01'),
    row('', 'EXPENSE', 100, '2026-09-01'),
  ];
  const map = buildDirectoryActivity(rows, { asOf: ASOF });
  assert.equal(map.get('a').out.total, 40);
  assert.equal(map.get('a').count, 1);
  assert.equal(map.size, 1);
});

check('the first and last months of the window are inside it, with a timestamp date too', () => {
  const rows = [row('a', 'EXPENSE', 10, '2025-11-01'), row('a', 'EXPENSE', 20, '2026-10-31T21:30:00+00:00')];
  const act = buildDirectoryActivity(rows, { asOf: ASOF }).get('a');
  assert.equal(act.out.series[0], 10);
  assert.equal(act.out.series[11], 20);
});

check('no rows, or rows of nobody, give an empty map; amounts keep three decimals', () => {
  assert.equal(buildDirectoryActivity([], { asOf: ASOF }).size, 0);
  const act = buildDirectoryActivity([row('a', 'EXPENSE', 0.1, '2026-10-01'), row('a', 'EXPENSE', 0.2, '2026-10-02')], { asOf: ASOF }).get('a');
  assert.equal(act.out.total, 0.3);
  assert.equal(act.out.series[11], 0.3);
});

check('the shared empty activity is zeros and has no last day', () => {
  assert.equal(NO_ACTIVITY.in.total + NO_ACTIVITY.out.total + NO_ACTIVITY.count, 0);
  assert.equal(NO_ACTIVITY.in.last, null);
  assert.equal(NO_ACTIVITY.out.series.length, 12);
});

// ------------------------------------------------------------ which side a row leads with

check('direction follows the role, and the data wins when the role finds nothing on its side', () => {
  const customer = contact({ kind: 'CUSTOMER' });
  const vendor = contact({ kind: 'VENDOR' });
  const other = contact({ kind: 'OTHER' });
  const onlyOut = buildDirectoryActivity([row('x', 'EXPENSE', 50, '2026-09-01')], { asOf: ASOF }).get('x');
  const onlyIn = buildDirectoryActivity([row('x', 'REVENUE', 50, '2026-09-01')], { asOf: ASOF }).get('x');
  const both = buildDirectoryActivity([row('x', 'REVENUE', 50, '2026-09-01'), row('x', 'EXPENSE', 20, '2026-09-01')], { asOf: ASOF }).get('x');
  assert.equal(listDirection(customer), 'in');
  assert.equal(listDirection(vendor), 'out');
  assert.equal(listDirection(customer, NO_ACTIVITY), 'in');
  assert.equal(listDirection(customer, onlyOut), 'out'); // a landlord or a utility filed under customers
  assert.equal(listDirection(vendor, onlyIn), 'in');
  assert.equal(listDirection(customer, both), 'in');
  assert.equal(listDirection(vendor, both), 'out');
  assert.equal(listDirection(other, onlyOut), 'out');
  assert.equal(listDirection(other, both), 'in');
  assert.equal(listDirection(contact({ kind: 'TENANT' })), 'in');
  assert.equal(listDirection(contact({ kind: 'EMPLOYEE' })), 'out');
  assert.equal(listDirection(contact({ kind: 'CUSTOMER', notes: '[role:landlord]' })), 'out');
});

check('the list agrees with the profile about which side leads', () => {
  const cases = [
    { c: contact({ kind: 'CUSTOMER' }), rows: [['EXPENSE', 50]] },
    { c: contact({ kind: 'CUSTOMER' }), rows: [['REVENUE', 50], ['EXPENSE', 10]] },
    { c: contact({ kind: 'VENDOR' }), rows: [['REVENUE', 50]] },
    { c: contact({ kind: 'VENDOR' }), rows: [] },
    { c: contact({ kind: 'OTHER' }), rows: [['EXPENSE', 90], ['REVENUE', 10]] },
    { c: contact({ kind: 'TENANT' }), rows: [['REVENUE', 10]] },
  ];
  for (const { c, rows } of cases) {
    const txs = rows.map(([kind, amount], i) => ({ id: `t${i}`, kind, status: 'POSTED', amount, tx_date: '2026-09-01' }));
    const act = buildDirectoryActivity(txs.map((t) => ({ contact_id: 'x', ...t })), { asOf: ASOF }).get('x') ?? NO_ACTIVITY;
    assert.equal(listDirection(c, act), primaryDirection(c, buildPartyStats(txs, { asOf: ASOF })), JSON.stringify(rows));
  }
});

// ------------------------------------------------------------ rows

check('rows carry the role, the side they lead with and the latest day of either side', () => {
  const landlord = contact({ id: 'L', kind: 'VENDOR', notes: '[role:landlord]' });
  const customer = contact({ id: 'K', kind: 'CUSTOMER' });
  const act = buildDirectoryActivity(
    [row('L', 'EXPENSE', 52000, '2026-08-31'), row('L', 'REVENUE', 5, '2026-09-30'), row('K', 'REVENUE', 800, '2026-10-02')],
    { asOf: ASOF },
  );
  const [l, k] = buildDirectoryRows([landlord, customer], act);
  assert.equal(l.role, 'LANDLORD');
  assert.equal(l.landlord, true);
  assert.equal(l.direction, 'out');
  assert.equal(l.main.total, 52000);
  assert.equal(l.other.total, 5);
  assert.equal(l.lastDate, '2026-09-30');
  assert.equal(k.role, 'CUSTOMER');
  assert.equal(k.direction, 'in');
  assert.equal(k.main.total, 800);
  assert.equal(l.hasActivity && k.hasActivity, true);
});

check('before the money has loaded every row is quiet: no activity, no hint, a direction by role', () => {
  const [r] = buildDirectoryRows([contact({ kind: 'VENDOR' })], null);
  assert.equal(r.hasActivity, false);
  assert.equal(r.lastDate, null);
  assert.equal(r.main.total, 0);
  assert.equal(r.landlordHint, null);
  assert.equal(r.direction, 'out');
});

check('a file paid rent and never received money is offered as a landlord, and only then', () => {
  const asCustomer = contact({ id: 'a', kind: 'CUSTOMER' });
  const withRevenue = contact({ id: 'b', kind: 'CUSTOMER' });
  const taggedAlready = contact({ id: 'c', kind: 'CUSTOMER', notes: '[role:landlord]' });
  const tenant = contact({ id: 'd', kind: 'TENANT' });
  const goods = contact({ id: 'e', kind: 'VENDOR' });
  const act = buildDirectoryActivity(
    [
      row('a', 'EXPENSE', 3000, '2026-07-05', { category: RENT }),
      row('a', 'EXPENSE', 3000, '2026-08-05', { category: RENT }),
      row('b', 'EXPENSE', 3000, '2026-07-05', { category: RENT }),
      row('b', 'REVENUE', 100, '2026-07-06'),
      row('c', 'EXPENSE', 3000, '2026-07-05', { category: RENT }),
      row('d', 'EXPENSE', 3000, '2026-07-05', { category: RENT }),
      row('e', 'EXPENSE', 3000, '2026-07-05', { category: { code: 'EXP-MAT' } }),
    ],
    { asOf: ASOF },
  );
  const rows = buildDirectoryRows([asCustomer, withRevenue, taggedAlready, tenant, goods], act);
  const hint = (id) => rows.find((r) => r.contact.id === id).landlordHint;
  assert.equal(hint('a').suggest, true);
  assert.equal(hint('a').rentPayments, 2);
  assert.equal(hint('a').rentTotal, 6000);
  assert.equal(hint('b'), null);
  assert.equal(hint('c'), null);
  assert.equal(hint('d'), null);
  assert.equal(hint('e'), null);
});

// ------------------------------------------------------------ search, filter, sort

const people = () => {
  const list = [
    contact({ id: 'm', kind: 'CUSTOMER', name: 'ميلاد الورفلي', phone: '0913000222', notes: '[role:landlord]' }),
    contact({ id: 'a', kind: 'CUSTOMER', name: 'أحمد سالم', phone: '0914000333', code: 'C-9' }),
    contact({ id: 'z', kind: 'CUSTOMER', name: 'شركة الرواد للإعلان', email: 'info@rowad.ly', address: 'طرابلس' }),
    contact({ id: 'o', kind: 'CUSTOMER', name: 'معرض السيارات', is_active: false }),
    contact({ id: 'v', kind: 'VENDOR', name: 'عبدالله المصراتي', notes: '[role:landlord]' }),
  ];
  const act = buildDirectoryActivity(
    [
      row('m', 'EXPENSE', 6000, '2026-08-31'),
      row('a', 'REVENUE', 900, '2026-10-02'),
      row('a', 'REVENUE', 100, '2026-09-02'),
      row('v', 'EXPENSE', 104000, '2026-07-30'),
    ],
    { asOf: ASOF },
  );
  return buildDirectoryRows(list, act);
};
const ids = (rows) => rows.map((r) => r.contact.id).join(',');

check('search ignores the Arabic spelling variants and looks at phone, code, mail, place and role words', () => {
  const rows = people();
  assert.equal(ids(filterDirectoryRows(rows, { query: 'احمد' })), 'a'); // أ typed as ا
  assert.equal(ids(filterDirectoryRows(rows, { query: '0913' })), 'm');
  assert.equal(ids(filterDirectoryRows(rows, { query: 'c-9' })), 'a');
  assert.equal(ids(filterDirectoryRows(rows, { query: 'rowad' })), 'z');
  assert.equal(ids(filterDirectoryRows(rows, { query: 'طرابلس' })), 'z');
  assert.equal(ids(filterDirectoryRows(rows, { query: 'مؤجر' })), 'm,v');
  assert.equal(ids(filterDirectoryRows(rows, { query: '   ' })), 'm,a,z,v');
  assert.equal(ids(filterDirectoryRows(rows, { query: 'لا يوجد هذا' })), '');
});

check('inactive files are hidden until asked for; the role filter and the search combine', () => {
  const rows = people();
  assert.equal(ids(filterDirectoryRows(rows, {})), 'm,a,z,v');
  assert.equal(ids(filterDirectoryRows(rows, { showInactive: true })), 'm,a,z,o,v');
  assert.equal(ids(filterDirectoryRows(rows, { role: 'LANDLORD' })), 'm,v');
  assert.equal(ids(filterDirectoryRows(rows, { role: 'CUSTOMER' })), 'a,z');
  assert.equal(ids(filterDirectoryRows(rows, { role: 'CUSTOMER', query: 'سالم' })), 'a');
  assert.equal(ids(filterDirectoryRows(rows, { role: 'LANDLORD', query: 'سالم' })), '');
});

check('sorting by name is alphabetical in Arabic, either way', () => {
  const rows = people();
  assert.deepEqual(DEFAULT_SORT, { key: 'name', dir: 'asc' });
  const asc = sortDirectoryRows(rows, { key: 'name', dir: 'asc' }).map((r) => r.contact.name);
  assert.deepEqual(asc, [...asc].sort((x, y) => x.localeCompare(y, 'ar')));
  assert.equal(ids(sortDirectoryRows(rows, { key: 'name', dir: 'desc' })), ids(sortDirectoryRows(rows, { key: 'name', dir: 'asc' })).split(',').reverse().join(','));
});

check('sorting by last movement puts the newest first and files with none last, whichever way', () => {
  const rows = people();
  assert.equal(ids(sortDirectoryRows(rows, { key: 'recent', dir: 'desc' })).split(',').slice(0, 3).join(','), 'a,m,v');
  assert.equal(ids(sortDirectoryRows(rows, { key: 'recent', dir: 'asc' })).split(',').slice(0, 3).join(','), 'v,m,a');
  for (const dir of ['asc', 'desc']) {
    const tail = sortDirectoryRows(rows, { key: 'recent', dir }).slice(-2).map((r) => r.lastDate);
    assert.deepEqual(tail, [null, null]);
  }
});

check('sorting by the twelve-month total follows the side each row leads with', () => {
  const rows = people();
  assert.equal(ids(sortDirectoryRows(rows, { key: 'total', dir: 'desc' })).split(',').slice(0, 3).join(','), 'v,m,a');
  assert.equal(sortDirectoryRows(rows, { key: 'total', dir: 'asc' })[rows.length - 1].contact.id, 'v');
});

check('equal values keep a stable order by name; the input is not changed', () => {
  const rows = people();
  const before = ids(rows);
  const sorted = sortDirectoryRows(rows, { key: 'total', dir: 'desc' });
  assert.equal(ids(rows), before);
  const zeros = sorted.filter((r) => r.main.total === 0).map((r) => r.contact.name);
  assert.deepEqual(zeros, [...zeros].sort((x, y) => x.localeCompare(y, 'ar')));
  assert.equal(defaultDirOf('name'), 'asc');
  assert.equal(defaultDirOf('recent'), 'desc');
  assert.equal(defaultDirOf('total'), 'desc');
  assert.deepEqual(sortDirectoryRows([], DEFAULT_SORT), []);
});

// ------------------------------------------------------------ totals above a list

check('the summary counts active files, landlords and files with money, and adds up money both ways', () => {
  const s = summarizeDirectory(people());
  assert.equal(s.count, 4);
  assert.equal(s.inactive, 1);
  assert.equal(s.landlords, 2);
  assert.equal(s.withActivity, 3);
  assert.equal(s.out.total, 110000);
  assert.equal(s.out.count, 2);
  assert.equal(s.in.total, 1000);
  assert.equal(s.in.count, 2);
  // both landlords were paid; the inactive customer and the plain one were not
  assert.deepEqual(s.landlordsOut, { total: 110000, count: 2 });
});

check('the latest payment and the latest receipt come with the file they belong to', () => {
  const s = summarizeDirectory(people());
  assert.deepEqual(s.lastOut, { date: '2026-08-31', amount: 6000, contactId: 'm', name: 'ميلاد الورفلي' });
  assert.deepEqual(s.lastIn, { date: '2026-10-02', amount: 900, contactId: 'a', name: 'أحمد سالم' });
});

check('on the same day the bigger amount is the latest; nothing at all gives nulls and zeros', () => {
  const list = [contact({ id: 'p', kind: 'VENDOR', name: 'ب' }), contact({ id: 'q', kind: 'VENDOR', name: 'أ' })];
  const act = buildDirectoryActivity([row('p', 'EXPENSE', 100, '2026-09-01'), row('q', 'EXPENSE', 300, '2026-09-01')], { asOf: ASOF });
  assert.equal(summarizeDirectory(buildDirectoryRows(list, act)).lastOut.contactId, 'q');
  assert.equal(summarizeDirectory(buildDirectoryRows([...list].reverse(), act)).lastOut.contactId, 'q');
  const empty = summarizeDirectory([]);
  assert.deepEqual([empty.count, empty.landlords, empty.in.total, empty.out.total, empty.lastIn, empty.lastOut], [0, 0, 0, 0, null, null]);
});

check('an inactive file still counts in the money (it moved) but not in the counts', () => {
  const list = [contact({ id: 'p', kind: 'VENDOR', is_active: false })];
  const act = buildDirectoryActivity([row('p', 'EXPENSE', 250, '2026-09-01')], { asOf: ASOF });
  const s = summarizeDirectory(buildDirectoryRows(list, act));
  assert.deepEqual([s.count, s.inactive, s.withActivity, s.out.total], [0, 1, 0, 250]);
});

// ------------------------------------------------------------ second line

check('the second line says what identifies the file, and is null when there is nothing', () => {
  assert.match(contactDetail(contact({ kind: 'TENANT', shop_number: '12', floor: 'الأول', monthly_rent: '2500' })), /محل 12 · الطابق الأول · إيجار .*2,500/);
  assert.match(contactDetail(contact({ kind: 'TENANT' })), /محل —/);
  assert.equal(contactDetail(contact({ kind: 'VENDOR', notes: '[role:landlord]', shop_number: 'A3' })), 'موقع A3');
  assert.equal(contactDetail(contact({ kind: 'VENDOR', notes: '[role:landlord]' })), null);
  assert.equal(contactDetail(contact({ kind: 'VENDOR', notes: '[role:supplier_water]', shop_number: '77', department: 'المياه' })), 'عداد 77 · المياه');
  assert.equal(contactDetail(contact({ kind: 'EMPLOYEE', job_title: 'محاسبة', department: 'المالية' })), 'محاسبة · المالية');
  assert.equal(contactDetail(contact({ kind: 'CUSTOMER', address: 'طرابلس', notes: 'إعلانات الواجهة\n[role:customer]' })), 'طرابلس · إعلانات الواجهة');
  assert.equal(contactDetail(contact({ kind: 'CUSTOMER', notes: '[role:customer]' })), null);
  assert.equal(contactDetail(contact({ kind: 'CUSTOMER', email: 'info@rowad.ly' })), null); // the mail has its own column
});

console.log(`\n${passed} checks passed`);
