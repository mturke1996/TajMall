/**
 * The logic behind the period journal options dialog (src/lib/period-journal-options.ts):
 *  - the selection of entries matches, combination by combination, what the original dialog selected and
 *    built (the old algorithm is kept below as a reference): basis, type, one account, months, a range, all;
 *  - what is new and optional: parties, cashboxes, payment methods, amount range, the order of the entries,
 *    the status rule, a range with the rent-month basis;
 *  - the period words, the file name, the scope note, the page estimate, the warnings;
 *  - the presets: the three built-ins, applying, saving, damaged storage, choices that no longer exist,
 *    storage that throws;
 *  - month ends, a leap day, from after to, empty selections, string amounts, voided rows, three-decimal sums.
 *   npx tsx scripts/verify-period-journal-options.mjs
 */
import assert from 'node:assert/strict';

const J = await import('../src/lib/period-journal-options.ts');
const R = await import('../src/lib/report-options.ts');
const { extractTargetRentMonth } = await import('../src/lib/period-journal-entry.ts');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};

const TODAY = '2026-10-19';
const round3 = (n) => Number(n.toFixed(3));

// ── data ─────────────────────────────────────────────────────────────────────
const CASH = { id: 'cb-1', name_ar: 'الخزينة النقدية', kind: 'CASH' };
const BANK = { id: 'cb-2', name_ar: 'مصرف الواحة', kind: 'BANK' };
const BANK2 = { id: 'cb-3', name_ar: 'مصرف الجمهورية', kind: 'BANK' };
const CAT = {
  rent: { id: 'c-rent', code: 'REV-RNT', name_ar: 'إيجارات المحلات' },
  park: { id: 'c-park', code: 'REV-PRK', name_ar: 'مواقف السيارات' },
  elec: { id: 'c-elc', code: 'EXP-ELC', name_ar: 'م.كهرباء' },
  sal: { id: 'c-sal', code: 'EXP-SAL', name_ar: 'م.مرتبات' },
};
const P = {
  a: { id: 'p-a', name: 'محل الأمل', shop_number: '101' },
  b: { id: 'p-b', name: 'مكتبة المعرفة', shop_number: '105' },
};
let seq = 0;
const tx = (o = {}) => {
  const cashbox = o.cashbox === undefined ? CASH : o.cashbox;
  return {
    id: `t${++seq}`,
    number: 1000 + seq,
    kind: 'REVENUE',
    status: 'POSTED',
    method: 'CASH',
    amount: '100',
    tx_date: '2026-10-05',
    description: null,
    category_id: CAT.rent.id,
    category: CAT.rent,
    cashbox_id: cashbox ? cashbox.id : null,
    cashbox,
    contact: P.a,
    ...o,
    ...(o.cashbox === undefined ? {} : { cashbox_id: o.cashbox ? o.cashbox.id : null }),
  };
};

const exp = (o = {}) => tx({ kind: 'EXPENSE', category_id: CAT.elec.id, category: CAT.elec, ...o });

const SAMPLE = [
  tx({ tx_date: '2026-07-05', description: 'ايجار شهر مايو', amount: '1200.5', method: 'TRANSFER', cashbox: BANK }),
  tx({ tx_date: '2026-07-10', description: 'إيجار 2026-07', amount: '800', cashbox: CASH }),
  tx({ tx_date: '2026-07-31', description: 'دفعة شهر أغسطس', amount: '450.125', method: 'CHEQUE', cashbox: BANK2, contact: P.b }),
  tx({ tx_date: '2026-08-01', description: 'ايجار 7/2026', amount: '0.1', cashbox: BANK, category_id: CAT.park.id, category: CAT.park }),
  tx({ tx_date: '2026-08-31', description: null, amount: '0.2', cashbox: BANK, category_id: CAT.park.id, category: CAT.park, contact: null }),
  tx({ tx_date: '2026-09-15', description: 'شهر 6', amount: '2000', method: 'CARD', cashbox: null }),
  tx({ tx_date: '2026-10-05', description: 'ايجار شهر اكتوبر', amount: '3000', cashbox: CASH, status: 'RECONCILED' }),
  tx({ tx_date: '2026-10-06', amount: '500', cashbox: CASH, status: 'DRAFT' }),
  tx({ tx_date: '2026-10-07', amount: '700', cashbox: CASH, status: 'VOIDED' }),
  tx({ tx_date: '2025-12-31', description: 'ايجار شهر ديسمبر 2025', amount: '999.999', cashbox: BANK }),
  tx({ tx_date: '2028-02-29', description: 'ايجار فبراير', amount: '10', cashbox: CASH }),
  exp({ tx_date: '2026-07-12', amount: '300', cashbox: CASH, method: 'CASH', contact: null, description: 'فاتورة كهرباء' }),
  exp({ tx_date: '2026-08-12', amount: '321.5', cashbox: BANK, method: 'TRANSFER', category_id: CAT.sal.id, category: CAT.sal, contact: P.b }),
  exp({ tx_date: '2026-10-12', amount: '42', cashbox: CASH, status: 'VOIDED' }),
  { ...tx({ tx_date: null, amount: '77' }), tx_date: null },
];

// ── the original dialog's algorithm, kept as a reference ─────────────────────
function oldFilter(transactions, s) {
  return transactions.filter((t) => {
    if (t.status !== 'POSTED' && t.status !== 'RECONCILED') return false;
    if (s.selectedCategoryId !== 'ALL' && t.category_id !== s.selectedCategoryId) return false;
    if (s.selectedCategoryId === 'ALL' && t.kind !== s.txKind) return false;
    if (s.selectedCashboxIds.length > 0 && t.cashbox_id && !s.selectedCashboxIds.includes(t.cashbox_id)) return false;
    if (s.basisMode === 'CASH_COLLECTED_IN_MONTH' || s.basisMode === 'GENERAL_ACCRUAL') {
      if (!t.tx_date) return false;
      if (s.dateRangeMode === 'MONTHS') {
        const y = Number(t.tx_date.slice(0, 4));
        const m = Number(t.tx_date.slice(5, 7));
        if (y !== s.selectedYear || !s.selectedMonths.includes(m)) return false;
      } else if (s.dateRangeMode === 'RANGE') {
        const d = t.tx_date.slice(0, 10);
        if (s.fromDate && d < s.fromDate) return false;
        if (s.toDate && d > s.toDate) return false;
      }
    } else if (s.basisMode === 'RENT_MONTH_TARGET') {
      const { target_rent_month_key } = extractTargetRentMonth(t.description, t.tx_date);
      if (s.dateRangeMode === 'MONTHS') {
        const keys = s.selectedMonths.map((m) => `${s.selectedYear}-${String(m).padStart(2, '0')}`);
        if (!target_rent_month_key || !keys.includes(target_rent_month_key)) return false;
      }
    }
    return true;
  });
}

function oldProcess(filtered, selectedCategory) {
  let grandTotal = 0;
  const tot = { PRIOR: [0, 0], CURRENT: [0, 0], FUTURE: [0, 0] };
  const banks = new Map();
  const cats = new Map();
  const methods = new Map();
  for (const t of filtered) {
    const amt = Number(t.amount || 0);
    grandTotal += amt;
    const { target_month_status } = extractTargetRentMonth(t.description, t.tx_date);
    if (tot[target_month_status]) {
      tot[target_month_status][0] += amt;
      tot[target_month_status][1] += 1;
    }
    const mKey = t.method || 'CASH';
    const m = methods.get(mKey) || { count: 0, total: 0 };
    m.count += 1;
    m.total += amt;
    methods.set(mKey, m);
    const cId = t.category_id || 'OTHER';
    const c = cats.get(cId) || { name: t.category?.name_ar || 'بدون بند', code: t.category?.code || '—', count: 0, total: 0 };
    c.count += 1;
    c.total += amt;
    cats.set(cId, c);
    const bId = t.cashbox_id || 'OTHER';
    let g = banks.get(bId);
    if (!g) {
      const isRevenue = t.kind === 'REVENUE';
      g = {
        cashboxId: bId,
        name: t.cashbox?.name_ar || 'الخزينة النقدية الرئيسية',
        kind: t.cashbox?.kind ?? 'CASH',
        total: 0,
        entryCount: 0,
        focusLineName: selectedCategory?.name_ar || (isRevenue ? 'إجمالي الإيرادات' : 'إجمالي المصروفات'),
        focusLineCode: selectedCategory?.code || (isRevenue ? 'REV*' : 'EXP*'),
        isCredit: isRevenue,
        ids: [],
      };
      banks.set(bId, g);
    }
    g.entryCount += 1;
    g.total += amt;
    g.ids.push(t.id);
  }
  return { grandTotal, tot, banks: [...banks.values()].sort((a, b) => b.total - a.total), cats, methods };
}

const monthsSel = (year, months) => ({ ...R.defaultPeriod(TODAY), mode: 'MONTHS', year, months });
const rangeSel = (from, to) => ({ ...R.defaultPeriod(TODAY), mode: 'RANGE', from, to });
const allSel = () => ({ ...R.defaultPeriod(TODAY), mode: 'ALL' });

const base = () => J.defaultJournalOptions(TODAY);
const opts = (patch = {}) => {
  const b = base();
  return {
    ...b,
    ...patch,
    period: patch.period ?? b.period,
    filters: { ...b.filters, ...(patch.filters ?? {}) },
    layout: { ...b.layout, ...(patch.layout ?? {}) },
  };
};
const select = (patch, rows = SAMPLE) => J.selectJournalRows(rows, opts(patch), TODAY);
const ids = (rows) => rows.map((r) => r.id).sort();

// ── equivalence with the original dialog ─────────────────────────────────────

check('every combination of basis, type, account and period selects and builds what the original dialog did', () => {
  const periods = [
    ['MONTHS', monthsSel(2026, [10]), { dateRangeMode: 'MONTHS', selectedYear: 2026, selectedMonths: [10] }],
    ['MONTHS', monthsSel(2026, [7, 8, 9]), { dateRangeMode: 'MONTHS', selectedYear: 2026, selectedMonths: [7, 8, 9] }],
    ['MONTHS', monthsSel(2026, [1, 3, 5, 7, 9, 11]), { dateRangeMode: 'MONTHS', selectedYear: 2026, selectedMonths: [1, 3, 5, 7, 9, 11] }],
    ['MONTHS', monthsSel(2026, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), { dateRangeMode: 'MONTHS', selectedYear: 2026, selectedMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
    ['MONTHS', monthsSel(2025, [12]), { dateRangeMode: 'MONTHS', selectedYear: 2025, selectedMonths: [12] }],
    ['MONTHS', monthsSel(2028, [2]), { dateRangeMode: 'MONTHS', selectedYear: 2028, selectedMonths: [2] }],
    ['RANGE', rangeSel('2026-07-10', '2026-08-31'), { dateRangeMode: 'RANGE', fromDate: '2026-07-10', toDate: '2026-08-31' }],
    ['RANGE', rangeSel('2026-09-01', ''), { dateRangeMode: 'RANGE', fromDate: '2026-09-01', toDate: '' }],
    ['RANGE', rangeSel('', '2026-07-31'), { dateRangeMode: 'RANGE', fromDate: '', toDate: '2026-07-31' }],
    ['ALL', allSel(), { dateRangeMode: 'ALL' }],
  ];
  let combos = 0;
  for (const basis of ['CASH_COLLECTED_IN_MONTH', 'RENT_MONTH_TARGET', 'GENERAL_ACCRUAL']) {
    for (const kind of ['REVENUE', 'EXPENSE']) {
      for (const account of ['ALL', CAT.rent.id, CAT.park.id, CAT.elec.id]) {
        for (const [mode, period, old] of periods) {
          // a range with the rent-month basis could not be chosen in the original dialog (it filtered nothing); it is covered below
          if (basis === 'RENT_MONTH_TARGET' && mode === 'RANGE') continue;
          const state = { selectedCategoryId: account, txKind: kind, selectedCashboxIds: [], basisMode: basis, ...old };
          const expected = oldFilter(SAMPLE, state);
          const category = account === 'ALL' ? null : Object.values(CAT).find((c) => c.id === account);
          const ref = oldProcess(expected, category);

          const o = opts({ basis, kind, categoryId: account, period });
          const sel = J.selectJournalRows(SAMPLE, o, TODAY);
          assert.deepEqual(ids(sel.rows), ids(expected), `rows ${basis} ${kind} ${account} ${mode}`);
          const data = J.buildJournalData(sel.rows, category);
          assert.equal(data.filteredCount, expected.length);
          assert.equal(round3(data.grandTotal), round3(ref.grandTotal), `total ${basis} ${kind} ${account} ${mode}`);
          for (const s of ['PRIOR', 'CURRENT', 'FUTURE']) {
            assert.equal(round3(data[`${s.toLowerCase()}PeriodTotal`]), round3(ref.tot[s][0]), `${s} total`);
            assert.equal(data[`${s.toLowerCase()}PeriodCount`], ref.tot[s][1], `${s} count`);
          }
          assert.deepEqual(
            data.bankGroups.map((g) => [g.cashboxId, g.name, g.kind, g.entryCount, round3(g.totalDebit), round3(g.totalCredit), g.focusLineName, g.focusLineCode, g.isCredit]),
            ref.banks.map((g) => [g.cashboxId, g.name, g.kind, g.entryCount, round3(g.total), round3(g.total), g.focusLineName, g.focusLineCode, g.isCredit]),
            `groups ${basis} ${kind} ${account} ${mode}`,
          );
          for (const g of data.bankGroups) assert.deepEqual(ids(g.items), ids(ref.banks.find((r) => r.cashboxId === g.cashboxId).ids.map((id) => ({ id }))));
          assert.deepEqual(
            data.categoriesSummary.map((c) => [c.name, c.code, c.count, round3(c.total)]),
            [...ref.cats.values()].sort((a, b) => b.total - a.total).map((c) => [c.name, c.code, c.count, round3(c.total)]),
          );
          assert.deepEqual(
            data.paymentMethodsSummary.map((m) => [m.method, m.count, round3(m.total)]).sort(),
            [...ref.methods.entries()].map(([k, v]) => [k, v.count, round3(v.total)]).sort(),
          );
          combos += 1;
        }
      }
    }
  }
  assert.ok(combos > 200, `${combos} combinations`);
});

check('a row without a date is in no period, also in «كل المدة»', () => {
  assert.ok(!select({ period: allSel() }).rows.some((r) => !r.tx_date));
  assert.ok(select({ period: allSel() }).rows.length > 0);
});

// ── new and optional ─────────────────────────────────────────────────────────

check('a range with the rent-month basis filters by the months the range touches', () => {
  const rows = select({ basis: 'RENT_MONTH_TARGET', period: rangeSel('2026-07-20', '2026-08-05') }).rows;
  // target months July and August: the entries naming 2026-07 / 7/2026 / «أغسطس»
  for (const r of rows) {
    const key = extractTargetRentMonth(r.description, r.tx_date).target_rent_month_key;
    assert.ok(key >= '2026-07' && key <= '2026-08', `${r.description} -> ${key}`);
  }
  assert.ok(rows.length >= 2);
  // open-ended ranges
  const from = select({ basis: 'RENT_MONTH_TARGET', period: rangeSel('2026-10-01', '') }).rows;
  assert.ok(from.every((r) => extractTargetRentMonth(r.description, r.tx_date).target_rent_month_key >= '2026-10'));
});

check('the rent-month basis with a ready-made period and with all of the time', () => {
  const quick = select({ basis: 'RENT_MONTH_TARGET', period: { ...R.defaultPeriod(TODAY), mode: 'QUICK', quick: 'THIS_MONTH' } }).rows;
  assert.ok(quick.every((r) => extractTargetRentMonth(r.description, r.tx_date).target_rent_month_key === '2026-10'));
  const all = select({ basis: 'RENT_MONTH_TARGET', period: allSel() }).rows;
  assert.equal(all.length, select({ basis: 'CASH_COLLECTED_IN_MONTH', period: allSel() }).rows.length + all.filter((r) => !r.tx_date).length);
});

check('only posted and reconciled entries count; voided and drafts never, and they are counted as left out', () => {
  const sel = select({ period: monthsSel(2026, [10]) });
  assert.deepEqual(sel.rows.map((r) => r.status), ['RECONCILED']);
  assert.deepEqual(sel.excluded, { voided: 1, drafts: 1 });
  // an expense voided in October is not counted under revenues
  assert.equal(select({ kind: 'EXPENSE', period: monthsSel(2026, [10]) }).excluded.voided, 1);
});

check('one account ignores the type; all accounts keep one type; nothing of the other type leaks in', () => {
  assert.ok(select({ categoryId: CAT.elec.id, kind: 'REVENUE', period: allSel() }).rows.every((r) => r.category_id === CAT.elec.id));
  assert.ok(select({ kind: 'EXPENSE', period: allSel() }).rows.every((r) => r.kind === 'EXPENSE'));
  assert.ok(select({ kind: 'REVENUE', period: allSel() }).rows.every((r) => r.kind === 'REVENUE'));
});

check('filters: an empty selection means no restriction', () => {
  const none = select({ period: allSel() });
  const empty = select({ period: allSel(), filters: { partyIds: [], cashboxIds: [], methods: [], minAmount: '', maxAmount: '' } });
  assert.deepEqual(ids(none.rows), ids(empty.rows));
  assert.equal(J.activeJournalFilterCount(J.clearJournalFilters()), 0);
});

check('filters: party (including «without a party»), cashbox, method', () => {
  const all = select({ period: allSel() }).rows;
  const a = select({ period: allSel(), filters: { partyIds: [P.a.id] } }).rows;
  assert.ok(a.length > 0 && a.every((r) => r.contact?.id === P.a.id));
  const none = select({ period: allSel(), filters: { partyIds: [R.NO_PARTY] } }).rows;
  assert.ok(none.length > 0 && none.every((r) => !r.contact));
  assert.equal(select({ period: allSel(), filters: { partyIds: [P.a.id, R.NO_PARTY, P.b.id] } }).rows.length, all.length);
  const bank = select({ period: allSel(), filters: { cashboxIds: [BANK.id] } }).rows;
  assert.ok(bank.length > 0 && bank.every((r) => r.cashbox_id === BANK.id));
  const cheque = select({ period: allSel(), filters: { methods: ['CHEQUE', 'CARD'] } }).rows;
  assert.ok(cheque.length === 2 && cheque.every((r) => ['CHEQUE', 'CARD'].includes(r.method)));
});

check('a cashbox filter keeps only entries of the chosen cashboxes; an entry without a cashbox is not among them', () => {
  const rows = select({ period: allSel(), filters: { cashboxIds: [CASH.id] } }).rows;
  assert.ok(rows.every((r) => r.cashbox_id === CASH.id));
  assert.ok(!rows.some((r) => r.cashbox_id == null));
});

check('amount range: string amounts, three decimals, inclusive limits, crossed limits and junk', () => {
  const rows = select({ period: allSel(), filters: { minAmount: '450.125', maxAmount: '1200.500' } }).rows;
  assert.deepEqual(rows.map((r) => r.amount).sort(), ['1200.5', '450.125', '800', '999.999']);
  assert.equal(select({ period: allSel(), filters: { minAmount: '1200.501' } }).rows.filter((r) => r.kind === 'REVENUE' && Number(r.amount) < 1200.501).length, 0);
  const exact = select({ period: allSel(), filters: { minAmount: '0.1', maxAmount: '0.2' } }).rows;
  assert.deepEqual(exact.map((r) => r.amount).sort(), ['0.1', '0.2']);
  const crossed = select({ period: allSel(), filters: { minAmount: '10', maxAmount: '5' } });
  assert.equal(crossed.rows.length, 0);
  assert.equal(crossed.valid, false);
  assert.ok(crossed.issues[0].includes('الحد الأدنى'));
  const junk = select({ period: allSel(), filters: { minAmount: 'abc' } });
  assert.equal(junk.valid, false);
  assert.equal(junk.rows.length, 0);
  const arabic = select({ period: allSel(), filters: { minAmount: '٢٠٠٠' } }).rows;
  assert.ok(arabic.every((r) => Number(r.amount) >= 2000));
});

check('period: from after to, nothing chosen, a day that does not exist', () => {
  const back = select({ period: rangeSel('2026-10-10', '2026-10-01') });
  assert.equal(back.valid, false);
  assert.equal(back.rows.length, 0);
  assert.ok(back.issues[0].includes('بعد'));
  assert.equal(select({ period: monthsSel(2026, []) }).valid, false);
  assert.equal(select({ period: rangeSel('2027-02-29', '2027-03-01') }).valid, false);
  assert.equal(select({ period: rangeSel('2028-02-29', '2028-02-29') }).rows.length, 1);
});

check('month ends and a leap day belong to their month', () => {
  assert.deepEqual(select({ period: monthsSel(2026, [7]) }).rows.map((r) => r.tx_date).sort(), ['2026-07-05', '2026-07-10', '2026-07-31']);
  assert.deepEqual(select({ period: monthsSel(2026, [8]) }).rows.map((r) => r.tx_date).sort(), ['2026-08-01', '2026-08-31']);
  assert.deepEqual(select({ period: monthsSel(2028, [2]) }).rows.map((r) => r.tx_date), ['2028-02-29']);
  assert.deepEqual(select({ period: monthsSel(2025, [12]) }).rows.map((r) => r.tx_date), ['2025-12-31']);
});

check('sorting: newest first, oldest first, largest first; ties never depend on the input order', () => {
  const dates = (sort) => select({ period: allSel(), layout: { sort } }).rows.map((r) => r.tx_date);
  assert.deepEqual(dates('DATE_DESC'), [...dates('DATE_DESC')].sort().reverse());
  assert.deepEqual(dates('DATE_ASC'), [...dates('DATE_ASC')].sort());
  const amounts = select({ period: allSel(), layout: { sort: 'AMOUNT_DESC' } }).rows.map((r) => Number(r.amount));
  assert.deepEqual(amounts, [...amounts].sort((x, y) => y - x));
  const twins = [tx({ id: 'z2', number: 5, amount: '10' }), tx({ id: 'z1', number: 5, amount: '10' }), tx({ id: 'z3', number: 4, amount: '10' })];
  const a = J.selectJournalRows(twins, opts({ period: allSel(), layout: { sort: 'AMOUNT_DESC' } }), TODAY).rows.map((r) => r.id);
  const b = J.selectJournalRows([...twins].reverse(), opts({ period: allSel(), layout: { sort: 'AMOUNT_DESC' } }), TODAY).rows.map((r) => r.id);
  assert.deepEqual(a, b);
});

check('the tables: one per cashbox, largest first, balanced, and the items add up to the total', () => {
  const sel = select({ period: allSel(), kind: 'REVENUE' });
  const data = J.buildJournalData(sel.rows, null);
  assert.ok(data.bankGroups.length >= 3);
  const totals = data.bankGroups.map((g) => g.totalDebit);
  assert.deepEqual(totals, [...totals].sort((x, y) => y - x));
  for (const g of data.bankGroups) {
    assert.equal(g.totalDebit, g.totalCredit);
    assert.equal(g.entryCount, g.items.length);
    assert.equal(round3(g.items.reduce((s, i) => s + Math.round(i.amount * 1000), 0) / 1000), g.totalDebit);
    assert.ok(g.items.every((i) => (g.isCredit ? i.credit === i.amount && i.debit === 0 : i.debit === i.amount && i.credit === 0)));
  }
  assert.equal(round3(data.bankGroups.reduce((s, g) => s + g.totalDebit, 0)), data.grandTotal);
  // an entry without a cashbox goes to the main cashbox table
  assert.ok(data.bankGroups.some((g) => g.cashboxId === 'OTHER' && g.name === 'الخزينة النقدية الرئيسية'));
  // an expense is debited
  const expense = J.buildJournalData(select({ kind: 'EXPENSE', period: allSel() }).rows, null);
  assert.ok(expense.bankGroups.every((g) => g.isCredit === false && g.items.every((i) => i.debit === i.amount)));
});

check('the order inside a table follows the chosen order, and a table keeps its place', () => {
  const asc = J.buildJournalData(select({ period: allSel(), layout: { sort: 'DATE_ASC' } }).rows, null);
  const desc = J.buildJournalData(select({ period: allSel(), layout: { sort: 'DATE_DESC' } }).rows, null);
  assert.deepEqual(asc.bankGroups.map((g) => g.cashboxId), desc.bankGroups.map((g) => g.cashboxId));
  for (const g of asc.bankGroups) {
    const d = g.items.map((i) => i.date);
    assert.deepEqual(d, [...d].sort());
  }
});

check('thousandths add up exactly: 0.1 + 0.2 is 0.3, 450.125 + 1200.5 is 1650.625', () => {
  assert.equal(J.buildJournalData([tx({ amount: '0.1' }), tx({ amount: '0.2' })], null).grandTotal, 0.3);
  assert.equal(J.buildJournalData([tx({ amount: '450.125' }), tx({ amount: 1200.5 })], null).grandTotal, 1650.625);
  assert.equal(J.buildJournalData([tx({ amount: null }), tx({ amount: 'abc' })], null).grandTotal, 0);
  assert.equal(J.buildJournalData([], null).bankGroups.length, 0);
});

check('the prior / current / future split follows the rent month in the description', () => {
  const rows = [
    tx({ tx_date: '2026-07-10', description: 'ايجار شهر مايو', amount: '100' }),
    tx({ tx_date: '2026-07-11', description: 'ايجار شهر يوليو', amount: '200' }),
    tx({ tx_date: '2026-07-12', description: 'ايجار شهر سبتمبر', amount: '300' }),
    tx({ tx_date: '2026-07-13', description: null, amount: '400' }),
  ];
  const d = J.buildJournalData(rows, null);
  assert.deepEqual([d.priorPeriodTotal, d.priorPeriodCount, d.currentPeriodTotal, d.currentPeriodCount, d.futurePeriodTotal, d.futurePeriodCount], [100, 1, 600, 2, 300, 1]);
});

check('the lists show what each choice would add under the other options (skip leaves one list out)', () => {
  const o = opts({ period: allSel(), kind: 'REVENUE', categoryId: CAT.park.id, filters: { partyIds: [P.a.id] } });
  const withoutAccount = SAMPLE.filter(J.buildJournalRowTest(o, TODAY, { skip: 'category' }).test);
  assert.ok(withoutAccount.every((r) => r.kind === 'REVENUE' && r.contact?.id === P.a.id));
  assert.ok(new Set(withoutAccount.map((r) => r.category_id)).size > 1);
  const withoutParty = SAMPLE.filter(J.buildJournalRowTest(o, TODAY, { skip: 'party' }).test);
  assert.ok(withoutParty.every((r) => r.category_id === CAT.park.id));
  assert.ok(withoutParty.length > SAMPLE.filter(J.buildJournalRowTest(o, TODAY).test).length);
});

check('the rows that match the period alone are counted for the «nothing matches» note', () => {
  const sel = select({ period: monthsSel(2026, [7]), categoryId: CAT.park.id });
  assert.equal(sel.rows.length, 0);
  assert.equal(sel.inPeriod, 3);
});

// ── words ────────────────────────────────────────────────────────────────────

check('the period as the report prints it', () => {
  const label = (sel) => J.journalPeriodLabel(sel, R.resolvePeriod(sel, TODAY));
  assert.equal(label(monthsSel(2026, [10])), 'أكتوبر 2026');
  assert.equal(label(monthsSel(2026, [1, 2, 3])), 'من يناير إلى مارس 2026');
  assert.equal(label(monthsSel(2026, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), 'كامل عام 2026');
  assert.equal(label(monthsSel(2026, [3, 1, 5])), 'أشهر يناير، مارس، مايو 2026');
  assert.equal(label(monthsSel(2028, [2])), 'فبراير 2028');
  assert.equal(label(allSel()), 'كامل المدة المسجلة');
  assert.equal(label(rangeSel('2026-10-01', '2026-10-31')), 'من 01/10/2026 إلى 31/10/2026');
  assert.equal(label({ ...R.defaultPeriod(TODAY), mode: 'QUICK', quick: 'THIS_QUARTER' }), 'من 01/10/2026 إلى 31/12/2026');
  assert.equal(label(monthsSel(2026, [])), '—');
});

check('the account and the basis as the report prints them', () => {
  assert.equal(J.journalCategoryLabel('REVENUE', null), 'كافة بنود الإيرادات');
  assert.equal(J.journalCategoryLabel('EXPENSE', null), 'كافة بنود المصروفات');
  assert.equal(J.journalCategoryLabel('REVENUE', { name_ar: 'إيجارات المحلات', code: 'REV-RNT' }), 'إيجارات المحلات (REV-RNT)');
  assert.equal(J.journalBasisLabel('CASH_COLLECTED_IN_MONTH'), 'التحصيل والتسجيل الفعلي بالدفاتر');
  assert.equal(J.journalBasisLabel('RENT_MONTH_TARGET'), 'شهر الاستحقاق والإيجار المستهدف');
  assert.equal(J.journalBasisLabel('GENERAL_ACCRUAL'), 'قيد اليومية المحاسبي المزدوج');
});

check('the file name carries the report, what it covers, the level and the period, and is safe', () => {
  const n = J.journalFileName({ scope: 'إيجارات المحلات', level: 'DETAILED', periodSlug: '2026-10', today: TODAY });
  assert.equal(n, 'قيد-الفترة-إيجارات_المحلات-تفصيلي-2026-10-2026-10-19');
  assert.equal(J.journalFileName({ scope: 'إيرادات', level: 'SUMMARY_ONLY', periodSlug: 'كامل-المدة', today: TODAY }), 'قيد-الفترة-إيرادات-مجموع-كامل-المدة-2026-10-19');
  const nasty = J.journalFileName({ scope: 'a/b\\c:d*e?"<>|ص'.repeat(5), level: 'DETAILED', periodSlug: '2026-10-01_2026-10-31', today: TODAY });
  assert.ok(!/[\\/:*?"<>|\s]/.test(nasty), nasty);
});

check('the scope note names the filters, in plain words; nothing filtered gives nothing', () => {
  const note = (patch, level = 'SUMMARY_ONLY', sort = 'DATE_DESC') =>
    J.buildJournalScopeNote({
      filters: { ...J.clearJournalFilters(), ...patch },
      layout: { sort },
      level,
      partyName: (id) => ({ [P.a.id]: P.a.name, [P.b.id]: P.b.name })[id],
      cashboxName: (id) => ({ [BANK.id]: BANK.name_ar })[id],
    });
  assert.equal(note({}), '');
  assert.equal(note({ partyIds: [P.a.id] }), 'التصفية: الجهة: محل الأمل');
  assert.equal(note({ partyIds: [P.a.id, R.NO_PARTY], cashboxIds: [BANK.id], methods: ['CASH', 'CHEQUE'] }), 'التصفية: الجهة: محل الأمل، بدون جهة · الخزينة: مصرف الواحة · طريقة الدفع: نقدي، صك');
  assert.equal(note({ minAmount: '100', maxAmount: '2500.5' }), 'التصفية: المبلغ من 100 إلى 2,500.5 د.ل');
  assert.equal(note({ minAmount: '10' }), 'التصفية: المبلغ 10 د.ل فأكثر');
  assert.equal(note({ maxAmount: '10' }), 'التصفية: المبلغ حتى 10 د.ل');
  assert.equal(note({ partyIds: ['gone'] }), 'التصفية: الجهة: جهة واحدة');
  assert.equal(note({ minAmount: '20', maxAmount: '10' }), '');
  assert.equal(note({}, 'DETAILED', 'DATE_ASC'), 'التصفية: الترتيب: الأقدم أولاً');
  assert.equal(note({}, 'SUMMARY_ONLY', 'DATE_ASC'), '');
});

check('the page estimate: one page when empty, growing with the entries and the tables, measured sizes', () => {
  assert.equal(J.estimateJournalPages({ level: 'DETAILED', groups: 0, rows: 0 }), 1);
  assert.equal(J.estimateJournalPages({ level: 'SUMMARY_ONLY', groups: 1, rows: 5 }), 1);
  assert.equal(J.estimateJournalPages({ level: 'SUMMARY_ONLY', groups: 2, rows: 5 }), 2);
  assert.equal(J.estimateJournalPages({ level: 'SUMMARY_ONLY', groups: 12, rows: 12 }), 5);
  assert.equal(J.estimateJournalPages({ level: 'DETAILED', groups: 1, rows: 130 }), 8);
  assert.equal(J.estimateJournalPages({ level: 'DETAILED', groups: 2, rows: 90 }), 6);
  let prev = 0;
  for (let n = 1; n <= 400; n += 1) {
    const p = J.estimateJournalPages({ level: 'DETAILED', groups: 2, rows: n });
    assert.ok(p >= prev && p - prev <= 1, `${n}: ${p} after ${prev}`);
    prev = p;
  }
  assert.ok(J.estimateJournalPages({ level: 'DETAILED', groups: 1, rows: 27, signature: true }) >= J.estimateJournalPages({ level: 'DETAILED', groups: 1, rows: 27 }));
});

check('warnings: a wrong option, nothing matches, prior months, a very large report, what was left out', () => {
  const w = (patch = {}) =>
    J.journalWarnings({ count: 5, pages: 2, issues: [], inPeriod: 5, excluded: { voided: 0, drafts: 0 }, priorTotal: 0, priorCount: 0, formatMoney: (n) => `${n} د.ل`, ...patch });
  assert.deepEqual(w(), []);
  assert.equal(w({ issues: ['تاريخ غير صحيح'], count: 0 })[0].tone, 'warning');
  assert.equal(w({ issues: ['x'], count: 0 }).length, 1);
  assert.ok(w({ count: 0, inPeriod: 0 })[0].text.includes('لا توجد معاملات'));
  assert.ok(w({ count: 0, inPeriod: 7 })[0].text.includes('7 معاملات'));
  const prior = w({ priorTotal: 1500, priorCount: 2 });
  assert.equal(prior[0].tone, 'info');
  assert.ok(prior[0].text.includes('1500 د.ل') && prior[0].text.includes('معاملتان'));
  assert.ok(w({ pages: 60 })[0].text.includes('نحو 60 صفحة'));
  assert.ok(w({ excluded: { voided: 1, drafts: 3 } }).map((x) => x.text).join(' ').includes('معاملة ملغاة'));
  assert.ok(w({ excluded: { voided: 0, drafts: 3 } })[0].text.includes('3 مسودات'));
  assert.ok(!w({ excluded: { voided: 0, drafts: 3 } })[0].text.includes('تضمين'));
});

// ── options and presets ──────────────────────────────────────────────────────

check('the dialog starts from the page: a month, a whole year, or this month', () => {
  const d = J.defaultJournalOptions(TODAY);
  assert.deepEqual([d.basis, d.level, d.kind, d.categoryId], ['CASH_COLLECTED_IN_MONTH', 'SUMMARY_ONLY', 'REVENUE', 'ALL']);
  assert.deepEqual([d.period.mode, d.period.year, d.period.months], ['MONTHS', 2026, [10]]);
  const month = J.defaultJournalOptions(TODAY, { period: { year: 2025, month: 3 } });
  assert.deepEqual([month.period.year, month.period.months], [2025, [3]]);
  const year = J.defaultJournalOptions(TODAY, { period: { year: 2025 } });
  assert.deepEqual([year.period.year, year.period.months.length], [2025, 12]);
  const bad = J.defaultJournalOptions(TODAY, { period: { year: 2025, month: 13 } });
  assert.equal(bad.period.months.length, 12);
  assert.equal(J.defaultJournalOptions(TODAY, { period: { year: Number.NaN } }).period.year, 2026);
  assert.equal(J.defaultJournalOptions(TODAY, { categoryId: 'c1', kind: 'EXPENSE' }).kind, 'EXPENSE');
  assert.equal(J.defaultJournalOptions(TODAY, { categoryId: '' }).categoryId, 'ALL');
  // the defaults of a fresh dialog never share a list with the next one
  assert.notEqual(J.defaultJournalOptions(TODAY).filters.partyIds, J.defaultJournalOptions(TODAY).filters.partyIds);
});

check('the three built-in presets: names, what they set, and that they stay current', () => {
  const p = J.builtInJournalPresets(TODAY);
  assert.deepEqual(p.map((x) => x.name), ['قيد الشهر الحالي المفصّل', 'تجميع الإيرادات والمصروفات للربع', 'التحصيل الفعلي للشهر']);
  assert.ok(p.every((x) => x.builtIn && x.id.startsWith('builtin:')));
  assert.equal(p[0].options.level, 'DETAILED');
  assert.equal(p[0].options.layout.signature, true);
  assert.deepEqual([p[1].options.level, p[1].options.period.quick], ['SUMMARY_ONLY', 'THIS_QUARTER']);
  assert.deepEqual([p[2].options.basis, p[2].options.kind], ['CASH_COLLECTED_IN_MONTH', 'REVENUE']);
  assert.deepEqual(p.map((x) => x.keepKind), [true, true, false]);
  assert.ok(p.every((x) => x.options.period.mode === 'QUICK'));
});

check('applying a preset: the type stays when the preset does not set it; the person\'s own title stays', () => {
  const p = J.builtInJournalPresets(TODAY);
  const current = opts({ kind: 'EXPENSE', layout: { title: 'عنواني' } });
  const a = J.applyJournalPreset(current, p[0]);
  assert.equal(a.kind, 'EXPENSE');
  assert.equal(a.level, 'DETAILED');
  assert.equal(a.layout.title, 'عنواني');
  assert.equal(J.applyJournalPreset(current, p[2]).kind, 'REVENUE');
  assert.equal(J.isJournalPresetActive(a, p[0]), true);
  assert.equal(J.isJournalPresetActive(current, p[0]), false);
  // applying one preset does not mark another
  assert.equal(J.isJournalPresetActive(a, p[1]), false);
});

check('presets round trip through the store; damaged or foreign data gives none', () => {
  const o = opts({ basis: 'RENT_MONTH_TARGET', level: 'DETAILED', kind: 'EXPENSE', categoryId: CAT.elec.id, period: monthsSel(2026, [3, 4]), filters: { partyIds: [P.a.id], methods: ['CASH'], minAmount: '5' }, layout: { sort: 'AMOUNT_DESC', signature: true, title: 'T', subtitle: 'S' } });
  const saved = J.upsertJournalPreset([], 'قيد المحاسب', o, 'p1');
  assert.equal(saved.error, null);
  const text = J.serializeJournalPresetStore(saved.presets);
  const back = J.parseJournalPresetStore(text, TODAY);
  assert.deepEqual(back, saved.presets);
  assert.deepEqual(J.parseJournalPresetStore(null, TODAY), []);
  assert.deepEqual(J.parseJournalPresetStore('', TODAY), []);
  assert.deepEqual(J.parseJournalPresetStore('{not json', TODAY), []);
  assert.deepEqual(J.parseJournalPresetStore('[1,2]', TODAY), []);
  assert.deepEqual(J.parseJournalPresetStore(JSON.stringify({ v: 2, presets: [{ id: 'a', name: 'x', options: {} }] }), TODAY), []);
  assert.deepEqual(J.parseJournalPresetStore(JSON.stringify({ v: 1, presets: 'no' }), TODAY), []);
});

check('damaged presets are repaired field by field, never trusted', () => {
  const messy = JSON.stringify({
    v: 1,
    presets: [
      { id: 'a', name: '  ok  ', options: { basis: 'NOPE', level: 7, kind: 'EXPENSE', categoryId: 12, period: { mode: 'WRONG', year: 'x', months: [0, 13, 5, 5, 'a'], from: '2026-02-30', to: '2026-03-01' }, filters: { partyIds: [1, 'p', 'p'], methods: ['CASH', 'GOLD'], minAmount: 'zz', maxAmount: '10' }, layout: { sort: 'X', signature: 'yes', title: 5 } } },
      { id: 'builtin:x', name: 'sneaky', options: {} },
      { id: 'a', name: 'duplicate id', options: {} },
      { id: 'b', name: '   ', options: {} },
      { name: 'no id', options: {} },
    ],
  });
  const [only, ...rest] = J.parseJournalPresetStore(messy, TODAY);
  assert.equal(rest.length, 0);
  assert.equal(only.name, 'ok');
  const o = only.options;
  assert.deepEqual([o.basis, o.level, o.kind, o.categoryId], ['CASH_COLLECTED_IN_MONTH', 'SUMMARY_ONLY', 'EXPENSE', 'ALL']);
  assert.deepEqual([o.period.mode, o.period.year, o.period.months, o.period.from, o.period.to], ['MONTHS', 2026, [5], '', '2026-03-01']);
  assert.deepEqual([o.filters.partyIds, o.filters.methods, o.filters.minAmount, o.filters.maxAmount], [['p'], ['CASH'], '', '10']);
  assert.deepEqual([o.layout.sort, o.layout.signature, o.layout.title], ['DATE_DESC', false, '']);
});

check('saving: the same name replaces, an empty name is refused, the list is capped, a built-in is never stored', () => {
  const a = opts({ level: 'DETAILED' });
  const b = opts({ level: 'SUMMARY_ONLY' });
  const one = J.upsertJournalPreset([], 'قيد', a, 'p1').presets;
  const two = J.upsertJournalPreset(one, '  قيد ', b, 'p2').presets;
  assert.equal(two.length, 1);
  assert.equal(two[0].id, 'p1');
  assert.equal(two[0].options.level, 'SUMMARY_ONLY');
  assert.equal(J.upsertJournalPreset(one, '   ', a, 'p3').error, 'اكتب اسماً للإعداد.');
  let many = [];
  for (let i = 0; i < 30; i += 1) many = J.upsertJournalPreset(many, `إعداد ${i}`, a, `p${i}`).presets;
  assert.equal(many.length, R.MAX_SAVED_PRESETS);
  assert.equal(many[many.length - 1].name, 'إعداد 29');
  assert.equal(J.upsertJournalPreset([], 'x'.repeat(100), a, 'p').presets[0].name.length, R.PRESET_NAME_MAX);
  const stored = J.serializeJournalPresetStore([...J.builtInJournalPresets(TODAY), ...one]);
  assert.equal(J.parseJournalPresetStore(stored, TODAY).length, 1);
  assert.deepEqual(J.deleteJournalPreset(two, 'p1'), []);
  assert.equal(J.deleteJournalPreset(two, 'nope').length, 1);
});

check('storage: works, refuses, throws, or does not exist', () => {
  const mem = new Map();
  const ok = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  const presets = J.upsertJournalPreset([], 'قيد', opts(), 'p1').presets;
  assert.equal(J.saveJournalPresets('k', presets, ok), true);
  assert.equal(J.parseJournalPresetStore(mem.get('k'), TODAY).length, 1);
  assert.equal(J.saveJournalPresets('k', presets, { getItem: () => null, setItem: () => { throw new Error('quota'); } }), false);
  assert.equal(J.saveJournalPresets('k', presets, null), false);
});

check('a preset saved with an account, party or cashbox that no longer exists loses only that choice', () => {
  const o = opts({ kind: 'REVENUE', categoryId: 'gone', filters: { partyIds: [P.a.id, 'gone-party', R.NO_PARTY], cashboxIds: ['gone-box', CASH.id] } });
  const known = { categories: new Map([[CAT.rent.id, 'REVENUE'], [CAT.elec.id, 'EXPENSE']]), parties: new Set([P.a.id]), cashboxes: new Set([CASH.id]) };
  const { options: next, dropped } = J.pruneJournalChoices(o, known);
  assert.equal(dropped, 3);
  assert.equal(next.categoryId, 'ALL');
  assert.deepEqual(next.filters.partyIds, [P.a.id, R.NO_PARTY]);
  assert.deepEqual(next.filters.cashboxIds, [CASH.id]);
  // an account that exists but is of the other type brings its type with it
  const e = J.pruneJournalChoices(opts({ kind: 'REVENUE', categoryId: CAT.elec.id }), known);
  assert.deepEqual([e.options.categoryId, e.options.kind, e.dropped], [CAT.elec.id, 'EXPENSE', 0]);
  // nothing to drop
  assert.equal(J.pruneJournalChoices(base(), known).dropped, 0);
});

check('a preset is described in one line, without the type when the preset leaves it', () => {
  const p = J.builtInJournalPresets(TODAY);
  assert.equal(J.describeJournalOptions(p[0].options, p[0].keepKind), 'قيد اليومية المزدوج · تفصيلي · هذا الشهر · مع التوقيع');
  assert.equal(J.describeJournalOptions(p[2].options, p[2].keepKind), 'التحصيل الفعلي في الفترة · تفصيلي · هذا الشهر · إيرادات');
  assert.equal(J.describeJournalOptions(opts({ period: monthsSel(2026, [1, 2]) })), 'التحصيل الفعلي في الفترة · مجموع فقط · شهران · إيرادات');
});

check('two sets of options ask for the same report whatever the title says', () => {
  const a = opts({ layout: { title: 'one' } });
  const b = opts({ layout: { title: 'two', subtitle: 'x' } });
  assert.equal(J.sameJournalOptions(a, b), true);
  assert.equal(J.sameJournalOptions(a, opts({ basis: 'GENERAL_ACCRUAL' })), false);
  assert.equal(J.sameJournalOptions(opts({ filters: { partyIds: ['a', 'b'] } }), opts({ filters: { partyIds: ['b', 'a'] } })), true);
});

check('no emoji in any word the dialog shows', () => {
  const emoji = /\p{Extended_Pictographic}|\u{1F300}-\u{1FAFF}|[☀-➿]|️/u;
  const texts = [
    ...J.BASIS_OPTIONS.flatMap((b) => [b.title, b.description, b.pdfLabel]),
    ...J.LEVEL_OPTIONS.flatMap((l) => [l.title, l.description]),
    ...J.KIND_OPTIONS.flatMap((k) => [k.label, k.plural, k.allAccounts, k.totalLabel]),
    ...J.builtInJournalPresets(TODAY).flatMap((p) => [p.name, J.describeJournalOptions(p.options, p.keepKind)]),
    J.JOURNAL_DEFAULT_TITLE,
    ...J.journalWarnings({ count: 0, pages: 99, issues: ['x'], inPeriod: 3, excluded: { voided: 2, drafts: 2 }, priorTotal: 5, priorCount: 1, formatMoney: (n) => String(n) }).map((w) => w.text),
  ];
  for (const t of texts) assert.ok(!emoji.test(t), `emoji in: ${t}`);
});

check('a large selection stays fast and exact', () => {
  const rows = Array.from({ length: 20000 }, (_, i) => tx({ tx_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`, amount: String((i % 97) + 0.125), cashbox: i % 3 === 0 ? BANK : CASH, description: i % 5 === 0 ? 'ايجار شهر مايو' : null }));
  const started = Date.now();
  const sel = J.selectJournalRows(rows, opts({ basis: 'RENT_MONTH_TARGET', period: monthsSel(2026, [5]) }), TODAY);
  const data = J.buildJournalData(sel.rows, null);
  assert.ok(Date.now() - started < 5000, 'took too long');
  assert.equal(data.filteredCount, sel.rows.length);
  assert.equal(round3(data.bankGroups.reduce((s, g) => s + g.totalDebit, 0)), data.grandTotal);
});

console.log(`\n${passed} checks passed`);
