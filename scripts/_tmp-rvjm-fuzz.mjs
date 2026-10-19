import assert from 'node:assert/strict';
const J = await import('../src/lib/period-journal-options.ts');
const R = await import('../src/lib/report-options.ts');
const { extractTargetRentMonth } = await import('../src/lib/period-journal-entry.ts');
// ---- the original dialog's algorithm, verbatim ----
function oldRun(transactions, s, selectedCategory) {
  const filtered = transactions.filter((t) => {
    if (t.status !== 'POSTED' && t.status !== 'RECONCILED') return false;
    if (s.selectedCategoryId !== 'ALL' && t.category_id !== s.selectedCategoryId) return false;
    if (s.selectedCategoryId === 'ALL' && t.kind !== s.txKind) return false;
    if (s.selectedCashboxIds.length > 0 && t.cashbox_id && !s.selectedCashboxIds.includes(t.cashbox_id)) return false;
    if (s.basisMode === 'CASH_COLLECTED_IN_MONTH' || s.basisMode === 'GENERAL_ACCRUAL') {
      if (!t.tx_date) return false;
      if (s.dateRangeMode === 'MONTHS') {
        const y = Number(t.tx_date.slice(0, 4)); const m = Number(t.tx_date.slice(5, 7));
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
  let grand = 0; const split = { PRIOR: [0, 0], CURRENT: [0, 0], FUTURE: [0, 0] };
  const banks = new Map(); const cats = new Map(); const methods = new Map();
  for (const t of filtered) {
    const amt = Number(t.amount || 0); grand += amt;
    const { target_month_status } = extractTargetRentMonth(t.description, t.tx_date);
    if (split[target_month_status]) { split[target_month_status][0] += amt; split[target_month_status][1] += 1; }
    const mk = t.method || 'CASH'; const m = methods.get(mk) || { count: 0, total: 0 }; m.count++; m.total += amt; methods.set(mk, m);
    const cid = t.category_id || 'OTHER'; const c = cats.get(cid) || { count: 0, total: 0 }; c.count++; c.total += amt; cats.set(cid, c);
    const bid = t.cashbox_id || 'OTHER'; let g = banks.get(bid);
    if (!g) { g = { id: bid, name: t.cashbox?.name_ar || 'الخزينة النقدية الرئيسية', kind: t.cashbox?.kind ?? 'CASH', total: 0, n: 0, isCredit: t.kind === 'REVENUE', ids: [] }; banks.set(bid, g); }
    g.n++; g.total += amt; g.ids.push(t.id);
  }
  return { ids: filtered.map((t) => t.id), grand, split, banks: [...banks.values()], cats, methods };
}
// ---- random data ----
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const CBS = [null, { id: 'c1', name_ar: 'نقدية', kind: 'CASH' }, { id: 'c2', name_ar: 'مصرف أ', kind: 'BANK' }, { id: 'c3', name_ar: 'مصرف ب', kind: 'BANK' }];
const CATS = [{ id: 'r1', code: 'R1', name_ar: 'إيجار' }, { id: 'r2', code: 'R2', name_ar: 'خدمات' }, { id: 'e1', code: 'E1', name_ar: 'كهرباء' }, { id: 'e2', code: 'E2', name_ar: 'صيانة' }];
const DESC = [null, '', 'إيجار شهر مايو', 'دفعة 2026-07', 'تحصيل 3/2026', 'شهر 5', 'ايجار اكتوبر 2025', 'بدون شهر', 'قسط ديسمبر'];
const AMT = ['100', '0.1', '0.2', '1200.5', '450.125', 12.5, '0', '', null, '1e3', '999999.999', 77];
let n = 0;
const rows = Array.from({ length: 600 }, () => {
  const cb = pick(CBS); const cat = pick(CATS);
  const d = rnd() < 0.03 ? null : `${pick([2025, 2026, 2026, 2026, 2027])}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
  return { id: `t${++n}`, number: n, kind: cat.id[0] === 'r' ? 'REVENUE' : 'EXPENSE', status: pick(['POSTED', 'POSTED', 'POSTED', 'RECONCILED', 'DRAFT', 'VOIDED']), method: pick(['CASH', 'CHEQUE', 'TRANSFER', 'CARD', null]), amount: pick(AMT), tx_date: d, description: pick(DESC), category_id: cat.id, category: cat, cashbox_id: cb?.id ?? null, cashbox: cb, contact: rnd() < 0.5 ? { id: 'p1', name: 'x', shop_number: '1' } : null };
});
const TODAY = '2026-10-19';
const periods = [
  ['MONTHS', { mode: 'MONTHS', year: 2026, months: [7], quick: 'THIS_MONTH', from: '', to: '' }, { dateRangeMode: 'MONTHS', selectedYear: 2026, selectedMonths: [7] }],
  ['MONTHS', { mode: 'MONTHS', year: 2026, months: [1, 5, 12], quick: 'THIS_MONTH', from: '', to: '' }, { dateRangeMode: 'MONTHS', selectedYear: 2026, selectedMonths: [1, 5, 12] }],
  ['MONTHS', { mode: 'MONTHS', year: 2025, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], quick: 'THIS_MONTH', from: '', to: '' }, { dateRangeMode: 'MONTHS', selectedYear: 2025, selectedMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
  ['RANGE', { mode: 'RANGE', year: 2026, months: [7], quick: 'THIS_MONTH', from: '2026-03-10', to: '2026-08-20' }, { dateRangeMode: 'RANGE', fromDate: '2026-03-10', toDate: '2026-08-20' }],
  ['ALL', { mode: 'ALL', year: 2026, months: [7], quick: 'THIS_MONTH', from: '', to: '' }, { dateRangeMode: 'ALL' }],
];
const diffs = new Map();
const note = (k, d) => { if (!diffs.has(k)) diffs.set(k, { n: 0, ex: d }); diffs.get(k).n += 1; };
for (const basis of ['CASH_COLLECTED_IN_MONTH', 'RENT_MONTH_TARGET', 'GENERAL_ACCRUAL']) {
  for (const kind of ['REVENUE', 'EXPENSE']) {
    for (const acc of ['ALL', 'r1', 'e1']) {
      for (const [pm, period, old] of periods) {
        if (basis === 'RENT_MONTH_TARGET' && pm === 'RANGE') continue; // not expressible in the old dialog
        const oldRes = oldRun(rows, { basisMode: basis, selectedCategoryId: acc, txKind: kind, selectedCashboxIds: [], ...old }, acc === 'ALL' ? null : CATS.find((c) => c.id === acc));
        const options = { ...J.defaultJournalOptions(TODAY), basis, level: 'DETAILED', kind, categoryId: acc, period: { ...R.defaultPeriod(TODAY), ...period } };
        options.layout.sort = 'DATE_DESC';
        const sel = J.selectJournalRows(rows, options, TODAY);
        const data = J.buildJournalData(sel.rows, acc === 'ALL' ? null : CATS.find((c) => c.id === acc));
        const label = `${basis}/${kind}/${acc}/${pm}`;
        const oldIds = new Set(oldRes.ids); const newIds = new Set(sel.rows.map((r) => r.id));
        const onlyOld = [...oldIds].filter((i) => !newIds.has(i)); const onlyNew = [...newIds].filter((i) => !oldIds.has(i));
        for (const i of onlyOld) { const t = rows.find((r) => r.id === i); note('IN OLD ONLY: status=' + t.status + ' date=' + (t.tx_date ? 'y' : 'null'), label + ' ' + i); }
        for (const i of onlyNew) { const t = rows.find((r) => r.id === i); note('IN NEW ONLY: status=' + t.status + ' date=' + (t.tx_date ? 'y' : 'null'), label + ' ' + i); }
        if (onlyOld.length === 0 && onlyNew.length === 0) {
          // same rows: compare figures (allow float noise and NaN of the old code)
          const gOld = oldRes.grand; const gNew = data.grandTotal;
          if (Number.isNaN(gOld)) note('OLD TOTAL IS NaN (non-numeric amount); new prints a number', label);
          else if (Math.abs(gOld - gNew) > 0.0005) note('TOTAL differs', `${label} old=${gOld} new=${gNew}`);
          const nb = data.bankGroups.map((g) => g.cashboxId + ':' + g.entryCount).sort().join(',');
          const ob = oldRes.banks.map((g) => g.id + ':' + g.n).sort().join(',');
          if (nb !== ob) note('bank groups differ', label + ' ' + nb + ' vs ' + ob);
          // item order inside each table: old = input order, new = by date desc
          for (const g of data.bankGroups) {
            const og = oldRes.banks.find((x) => x.id === g.cashboxId);
            const same = JSON.stringify(og.ids) === JSON.stringify(g.items.map((i) => i.id));
            if (!same) note('ORDER inside a table differs from input order (expected: date order now)', label);
          }
          // balanced
          for (const g of data.bankGroups) if (g.totalDebit !== g.totalCredit) note('UNBALANCED table', label);
          const itemSum = Math.round(data.bankGroups.flatMap((g) => g.items).reduce((s, i) => s + i.amount * 1000, 0));
          if (itemSum !== Math.round(data.grandTotal * 1000)) note('items do not add to grand total', label);
          const tbl = Math.round(data.bankGroups.reduce((s, g) => s + g.totalDebit * 1000, 0));
          if (tbl !== Math.round(data.grandTotal * 1000)) note('tables do not add to grand total', label);
          if (data.priorPeriodCount !== oldRes.split.PRIOR[1] || data.currentPeriodCount !== oldRes.split.CURRENT[1] || data.futurePeriodCount !== oldRes.split.FUTURE[1]) note('split counts differ', label);
        }
      }
    }
  }
}
for (const [k, v] of diffs) console.log(String(v.n).padStart(4), k, '| e.g.', v.ex);
console.log('done');
