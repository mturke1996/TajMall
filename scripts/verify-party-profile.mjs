/**
 * The data behind a vendor / customer profile: the four figures, the twelve bars, the account slices, the last
 * movements, the statement, the chips under the name, and the small changes a profile makes to a contact
 * (move to the other list, approve as landlord, keep list and tracking month through an edit-form save).
 *   npx tsx scripts/verify-party-profile.mjs
 */
import assert from 'node:assert/strict';

const pp = await import('../src/lib/people/party-profile.ts');
const { buildPartyStats } = await import('../src/lib/people/party-stats.ts');
const { readTags, visibleNotes } = await import('../src/lib/contacts/contact-tags.ts');
const { extractContactBusinessRole } = await import('../src/lib/contacts/contact-roles.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const ASOF = '2026-10-19';
let seq = 0;
const cat = (code, name) => ({ id: `cat-${code}`, code, name_ar: name });
const tx = (kind, amount, date, category = null, over = {}) => ({ id: `t${++seq}`, number: 1000 + seq, kind, status: 'POSTED', amount: String(amount), tx_date: date, created_at: `${date}T10:00:00Z`, description: null, category, ...over });
const ELC = cat('EXP-ELC', 'كهرباء');
const MNT = cat('EXP-MNT', 'صيانة');
const RNT = cat('EXP-RNT', 'إيجار');
const stats = (rows) => buildPartyStats(rows, { asOf: ASOF });

const vendor = (over = {}) => ({ id: 'v', kind: 'VENDOR', notes: null, job_title: null, department: null, monthly_rent: null, ...over });
const customer = (over = {}) => ({ id: 'c', kind: 'CUSTOMER', notes: null, job_title: null, department: null, monthly_rent: null, ...over });

// ---- direction and words ----

check('the profile leads with the side the role pays, and the data wins when that side is empty', () => {
  assert.equal(pp.profileDirection(vendor()), 'out');
  assert.equal(pp.profileDirection(customer()), 'in');
  // loading: no stats yet, the role decides
  assert.equal(pp.profileDirection(customer(), null), 'in');
  // a landlord filed under customers: paid, never paying
  const landlord = customer({ notes: '[role:landlord]' });
  assert.equal(pp.profileDirection(landlord), 'out');
  // a customer file that only ever received money (a water utility filed under customers)
  const water = stats([tx('EXPENSE', 300, '2026-09-01'), tx('EXPENSE', 300, '2026-10-01')]);
  assert.equal(pp.profileDirection(customer(), water), 'out');
  // a customer who pays leads with money in
  assert.equal(pp.profileDirection(customer(), stats([tx('REVENUE', 100, '2026-10-01')])), 'in');
  assert.equal(pp.txKindOfDirection('out'), 'EXPENSE');
  assert.equal(pp.txKindOfDirection('in'), 'REVENUE');
  assert.equal(pp.DIRECTION_WORDS.out.voucher, 'سند صرف');
  assert.equal(pp.DIRECTION_WORDS.in.voucher, 'سند قبض');
});

// ---- figures ----

check('a vendor paid for ten months: twelve-month total, all-time total, last payment, count, average', () => {
  const rows = [];
  for (let m = 1; m <= 10; m += 1) rows.push(tx('EXPENSE', 1000 + m * 100, `2026-${String(m).padStart(2, '0')}-08`, ELC));
  rows.push(tx('EXPENSE', 500, '2025-03-01', MNT)); // older than the twelve-month window
  const s = stats(rows);
  const f = pp.buildProfileFigures(s, 'out');
  // Nov 2025 .. Oct 2026 holds the ten payments of 2026 only
  const ten = rows.slice(0, 10).reduce((a, r) => a + Number(r.amount), 0);
  assert.equal(f.twelveMonths, ten);
  assert.equal(f.allTime, ten + 500);
  assert.equal(f.count, 11);
  assert.equal(f.totalCount, 11);
  assert.deepEqual(f.last, { id: rows[9].id, date: '2026-10-08', amount: 2000 });
  assert.equal(f.activeMonths, 11);
  assert.equal(f.average, Math.round(((ten + 500) / 11) * 1000) / 1000);
  assert.equal(f.other.count, 0);
});

check('both sides: the leading side is read, the other is kept for the count line', () => {
  const s = stats([tx('EXPENSE', 400, '2026-10-01'), tx('REVENUE', 150, '2026-10-02'), tx('REVENUE', 50, '2026-09-02')]);
  const f = pp.buildProfileFigures(s, 'out');
  assert.equal(f.twelveMonths, 400);
  assert.equal(f.count, 1);
  assert.equal(f.totalCount, 3);
  assert.equal(f.other.count, 2);
  assert.equal(f.other.total, 200);
});

check('nothing recorded: zeros and no last payment, never a broken number', () => {
  const f = pp.buildProfileFigures(stats([]), 'in');
  assert.deepEqual([f.twelveMonths, f.allTime, f.count, f.totalCount, f.average, f.activeMonths], [0, 0, 0, 0, 0, 0]);
  assert.equal(f.last, null);
});

check('drafts, voided rows, transfers and bad amounts are in no figure', () => {
  const s = stats([
    tx('EXPENSE', 100, '2026-10-01'),
    tx('EXPENSE', 999, '2026-10-02', null, { status: 'DRAFT' }),
    tx('EXPENSE', 999, '2026-10-03', null, { status: 'VOIDED' }),
    tx('TRANSFER', 999, '2026-10-04'),
    tx('EXPENSE', 'abc', '2026-10-05'),
    tx('EXPENSE', 50, '2026-10-06', null, { status: 'RECONCILED' }),
  ]);
  const f = pp.buildProfileFigures(s, 'out');
  assert.equal(f.allTime, 150);
  assert.equal(f.count, 2);
});

// ---- bars ----

check('twelve bars, oldest first, month names that never repeat, and the range in words', () => {
  const s = stats([tx('EXPENSE', 700, '2026-10-02'), tx('EXPENSE', 300, '2026-01-15'), tx('EXPENSE', 200, '2025-12-15')]);
  const bars = pp.monthBars(s.out);
  assert.equal(bars.length, 12);
  assert.deepEqual([bars[0].monthKey, bars[11].monthKey], ['2025-11', '2026-10']);
  assert.equal(bars[0].label, 'نوفمبر');
  assert.equal(bars[1].label, 'ديسمبر');
  assert.equal(bars[2].label, 'يناير');
  assert.equal(bars[11].label, 'أكتوبر');
  assert.equal(bars[11].amount, 700);
  assert.equal(bars[1].amount, 200);
  assert.equal(new Set(bars.map((b) => b.label)).size, 12, 'labels are unique (they key the table)');
  assert.deepEqual(pp.peakMonth(bars), bars[11]);
  assert.equal(pp.barsRange(bars), 'من نوفمبر 2025 إلى أكتوبر 2026');
  assert.equal(pp.barsRange([]), '');
});

check('peak month: none when every month is empty; the first of two equal months wins', () => {
  assert.equal(pp.peakMonth(pp.monthBars(stats([]).out)), null);
  const bars = pp.monthBars(stats([tx('EXPENSE', 500, '2026-09-02'), tx('EXPENSE', 500, '2026-10-02')]).out);
  assert.equal(pp.peakMonth(bars).monthKey, '2026-09');
});

// ---- slices ----

check('accounts: the top five and one slice for the rest; a single account is one slice', () => {
  const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const rows = codes.map((c, i) => tx('EXPENSE', (7 - i) * 100, '2026-10-01', cat(c, `بند ${c}`)));
  const slices = pp.accountSlices(stats(rows).out, 5);
  assert.equal(slices.length, 6);
  assert.equal(slices[0].label, 'بند A');
  assert.equal(slices[5].rest, true);
  assert.equal(slices[5].value, 300);
  assert.equal(slices.reduce((s, x) => s + x.value, 0), 2800);
  assert.equal(pp.accountSlices(stats([tx('EXPENSE', 90, '2026-10-01', ELC)]).out).length, 1);
  assert.deepEqual(pp.accountSlices(stats([]).out), []);
});

// ---- movements ----

check('the latest five by date, then creation; every status; the input is not changed', () => {
  const rows = [
    tx('EXPENSE', 1, '2026-10-01'),
    tx('EXPENSE', 2, '2026-10-05', null, { status: 'DRAFT' }),
    tx('EXPENSE', 3, '2026-10-05', null, { created_at: '2026-10-05T18:00:00Z' }),
    tx('EXPENSE', 4, '2026-09-20'),
    tx('EXPENSE', 5, '2026-08-01'),
    tx('EXPENSE', 6, '2026-07-01'),
  ];
  const copy = [...rows];
  const out = pp.recentMovements(rows, 5);
  assert.equal(out.length, 5);
  assert.deepEqual(out.map((r) => r.amount), ['3', '2', '1', '4', '5']);
  assert.deepEqual(rows, copy);
  assert.deepEqual(pp.recentMovements([], 5), []);
  assert.deepEqual(pp.recentMovements(rows, 0), []);
  assert.equal(pp.uncountedCount(rows), 1);
  assert.equal(pp.uncountedCount([]), 0);
});

// ---- the chips under the name ----

check('chips: a role chip for a tagged or special role, the kind in plain words otherwise', () => {
  assert.deepEqual(pp.profileLook(vendor()), { role: null, kindLabel: 'مورد' });
  assert.deepEqual(pp.profileLook(customer()), { role: null, kindLabel: 'عميل' });
  assert.deepEqual(pp.profileLook(customer({ notes: '[role:customer]' })), { role: 'CUSTOMER', kindLabel: null });
  assert.deepEqual(pp.profileLook(vendor({ notes: '[role:supplier_electricity]' })), { role: 'SUPPLIER_ELECTRICITY', kindLabel: null });
  assert.deepEqual(pp.profileLook(vendor({ department: 'كهرباء وطاقة' })), { role: 'SUPPLIER_ELECTRICITY', kindLabel: null });
  // a landlord is a landlord whichever list it sits in, and never reads «مورد»
  assert.deepEqual(pp.profileLook(vendor({ notes: '[role:landlord]' })), { role: 'LANDLORD', kindLabel: null });
  assert.deepEqual(pp.profileLook(customer({ notes: '[role:landlord]' })), { role: 'LANDLORD', kindLabel: null });
  assert.deepEqual(pp.profileLook({ kind: 'OTHER' }), { role: null, kindLabel: 'جهة أخرى' });
  assert.deepEqual(pp.profileLook({ kind: 'WHATEVER' }), { role: null, kindLabel: 'جهة أخرى' });
});

check('back label names the list the file is shown in', () => {
  assert.equal(pp.backLabel('VENDOR', false), 'الموردون');
  assert.equal(pp.backLabel('CUSTOMER', false), 'العملاء');
  assert.equal(pp.backLabel('VENDOR', true), 'المؤجرون');
  assert.equal(pp.backLabel('CUSTOMER', true), 'المؤجرون');
  assert.equal(pp.backLabel('OTHER', true), 'الجهات');
  assert.equal(pp.backLabel('TENANT', false), 'الجهات');
});

// ---- moving a contact between lists ----

check('only vendors and customers can be moved, to the other list', () => {
  assert.equal(pp.moveTarget('VENDOR'), 'CUSTOMER');
  assert.equal(pp.moveTarget('CUSTOMER'), 'VENDOR');
  for (const k of ['TENANT', 'EMPLOYEE', 'OTHER', '', null, undefined]) assert.equal(pp.moveTarget(k), null);
});

check('moving a landlord keeps it a landlord, the other tags and the note text', () => {
  const l = vendor({ notes: 'ملاحظة\n[role:landlord]\n[since:2026-07]' });
  const patch = pp.moveKindPatch(l, 'CUSTOMER');
  assert.equal(patch.kind, 'CUSTOMER');
  const moved = { ...l, ...patch };
  assert.equal(extractContactBusinessRole(moved), 'LANDLORD');
  assert.deepEqual(readTags(patch.notes), { role: 'LANDLORD', since: '2026-07' });
  assert.equal(visibleNotes(patch.notes), 'ملاحظة');
});

check('a landlord known only by an old rule gets an explicit tag before it moves', () => {
  const oldRule = vendor({ monthly_rent: '5000' });
  assert.equal(extractContactBusinessRole(oldRule), 'LANDLORD');
  const patch = pp.moveKindPatch(oldRule, 'CUSTOMER');
  assert.equal(extractContactBusinessRole({ ...oldRule, ...patch }), 'LANDLORD');
  assert.equal(readTags(patch.notes).role, 'LANDLORD');
});

check('moving any other file drops the old list\'s role tag but keeps the text and the tracking month', () => {
  const supplier = vendor({ notes: 'مولدات\n[role:supplier_electricity]\n[since:2026-06]' });
  const toCustomers = pp.moveKindPatch(supplier, 'CUSTOMER');
  assert.equal(toCustomers.kind, 'CUSTOMER');
  assert.equal(readTags(toCustomers.notes).role, null);
  assert.equal(readTags(toCustomers.notes).since, '2026-06');
  assert.equal(extractContactBusinessRole({ ...supplier, ...toCustomers }), 'CUSTOMER');

  const tagged = customer({ notes: '[role:customer]' });
  const toVendors = pp.moveKindPatch(tagged, 'VENDOR');
  assert.equal(toVendors.kind, 'VENDOR');
  assert.equal(toVendors.notes, null, 'nothing left in the notes is null, not an empty string');
  assert.equal(extractContactBusinessRole({ ...tagged, ...toVendors }), 'SUPPLIER_GOODS');

  assert.equal(pp.moveKindPatch(customer(), 'VENDOR').notes, null);
});

// ---- approving a landlord ----

check('approving a landlord tags the note and sets the title only when there is none', () => {
  const a = pp.approveLandlordPatch({ notes: 'تأجير أرضية المولد', job_title: null });
  assert.equal(readTags(a.notes).role, 'LANDLORD');
  assert.equal(visibleNotes(a.notes), 'تأجير أرضية المولد');
  assert.equal(a.job_title, 'مؤجر للمول');
  assert.equal(pp.approveLandlordPatch({ notes: null, job_title: 'مالك' }).job_title, 'مالك');
  assert.equal(pp.approveLandlordPatch({ notes: null, job_title: '  ' }).job_title, 'مؤجر للمول');
  assert.equal(pp.approveLandlordPatch({ notes: '[role:customer]', job_title: null }).notes, '[role:landlord]');
});

// ---- the edit-form save ----

check('a landlord filed under customers stays there when the form saves', () => {
  // what encodeContactRoleFields(LANDLORD) builds: kind VENDOR
  const payload = { kind: 'VENDOR', notes: '[role:landlord]', name: 'س' };
  const kept = pp.reconcileSavePayload(payload, { notes: '[role:landlord]' }, { businessRole: 'LANDLORD', kind: 'CUSTOMER' });
  assert.equal(kept.kind, 'CUSTOMER');
  assert.equal(payload.kind, 'VENDOR', 'the payload that came in is not changed');
  assert.equal(kept.name, 'س');
  // filed under vendors stays under vendors
  assert.equal(pp.reconcileSavePayload(payload, { notes: null }, { businessRole: 'LANDLORD', kind: 'VENDOR' }).kind, 'VENDOR');
  // changing a customer to a supplier in the form is a real change of kind
  assert.equal(pp.reconcileSavePayload({ kind: 'VENDOR', notes: null }, { notes: null }, { businessRole: 'SUPPLIER_WATER', kind: 'VENDOR' }).kind, 'VENDOR');
  assert.equal(pp.reconcileSavePayload({ kind: 'VENDOR', notes: null }, { notes: null }, { businessRole: 'SUPPLIER_WATER', kind: 'CUSTOMER' }).kind, 'VENDOR');
  // an unknown kind in the form never overrides
  assert.equal(pp.reconcileSavePayload(payload, { notes: null }, { businessRole: 'LANDLORD', kind: 'TENANT' }).kind, 'VENDOR');
});

check('the tracking month survives a form save, and a form that edits it is left alone', () => {
  const before = '[role:landlord]\n[since:2026-06]';
  const lost = { kind: 'VENDOR', notes: '[role:landlord]' };
  const fixed = pp.reconcileSavePayload(lost, { notes: before }, { businessRole: 'LANDLORD', kind: 'VENDOR' });
  assert.deepEqual(readTags(fixed.notes), { role: 'LANDLORD', since: '2026-06' });
  // the form cleared it on purpose
  const cleared = pp.reconcileSavePayload(lost, { notes: before }, { businessRole: 'LANDLORD', kind: 'VENDOR', since: null });
  assert.equal(readTags(cleared.notes).since, null);
  // nothing to keep, nothing added; a payload that kept it already is not doubled
  assert.equal(pp.reconcileSavePayload({ kind: 'VENDOR', notes: null }, { notes: '[role:supplier_water]' }, { businessRole: 'SUPPLIER_WATER', kind: 'VENDOR' }).notes, null);
  const kept = { kind: 'VENDOR', notes: '[role:landlord]\n[since:2026-08]' };
  assert.equal(pp.reconcileSavePayload(kept, { notes: before }, { businessRole: 'LANDLORD', kind: 'VENDOR' }).notes, kept.notes);
  // free text stays, the tag goes on its own line after it
  const withText = pp.reconcileSavePayload({ kind: 'VENDOR', notes: 'نص\n[role:landlord]' }, { notes: before }, { businessRole: 'LANDLORD', kind: 'VENDOR' });
  assert.equal(withText.notes, 'نص\n[role:landlord]\n[since:2026-06]');
});

// ---- statement ----

check('statement: counted rows in date order with a running net and totals', () => {
  const rows = [
    tx('EXPENSE', 300, '2026-10-05', MNT, { description: 'صيانة المصعد' }),
    tx('REVENUE', 100, '2026-09-01', null, { description: 'استرداد' }),
    tx('EXPENSE', 50, '2026-10-05', MNT, { number: 5 }),
    tx('EXPENSE', 999, '2026-10-06', null, { status: 'DRAFT' }),
    tx('TRANSFER', 20, '2026-10-07'),
    tx('EXPENSE', 0, '2026-10-08'),
    tx('EXPENSE', 'x', '2026-10-09'),
  ];
  const st = pp.buildStatement(rows);
  assert.equal(st.rows.length, 3);
  assert.deepEqual(st.rows.map((r) => [r.received, r.paid, r.net]), [[100, 0, 100], [0, 50, 50], [0, 300, -250]]);
  assert.equal(st.rows[0].description, 'استرداد');
  assert.equal(st.rows[2].account, 'صيانة');
  assert.deepEqual([st.totalReceived, st.totalPaid, st.net], [100, 350, -250]);
  assert.equal(st.net, st.rows[st.rows.length - 1].net);
  assert.deepEqual([st.from, st.to], ['2026-09-01', '2026-10-05']);
});

check('statement: empty input and floating-point noise', () => {
  const none = pp.buildStatement([]);
  assert.deepEqual([none.rows.length, none.totalReceived, none.totalPaid, none.net, none.from, none.to], [0, 0, 0, 0, null, null]);
  const noisy = pp.buildStatement([tx('EXPENSE', 0.1, '2026-10-01'), tx('EXPENSE', 0.2, '2026-10-02')]);
  assert.equal(noisy.totalPaid, 0.3);
  assert.equal(noisy.net, -0.3);
  assert.equal(pp.buildStatement([tx('EXPENSE', 5, '2026-10-01', null, { number: undefined })]).rows[0].number, null);
});

console.log(`\n${passed} checks passed`);
