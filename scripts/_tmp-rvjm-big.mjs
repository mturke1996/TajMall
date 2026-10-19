import { rows as _r, save, J, R, React, PeriodJournalExecutivePDF, OUT, TODAY } from './_tmp-rvjm-render.mjs';
const mk = (n, groups) => Array.from({ length: n }, (_, i) => {
  const cb = { id: `cb${i % groups}`, name_ar: `مصرف رقم ${i % groups}`, kind: i % groups === 0 ? 'CASH' : 'BANK' };
  return { id: `s${i}`, number: 100 + i, kind: 'REVENUE', status: 'POSTED', method: 'CASH', amount: String(100 + i / 7), tx_date: '2026-07-' + String(1 + (i % 28)).padStart(2, '0'), description: i % 3 ? 'إيجار شهر يوليو' : 'إيجار شهر مايو', category_id: 'c', category: { id: 'c', code: 'C', name_ar: 'إيجار' }, cashbox_id: cb.id, cashbox: cb, contact: { id: 'p' + (i % 9), name: 'محل ' + i, shop_number: String(i) } };
});
for (const [n, g] of [[1500, 3]]) {
  const rows = mk(n, g);
  const opt = { ...J.defaultJournalOptions(TODAY, { period: { year: 2026, month: 7 } }), level: 'DETAILED' };
  const sel = J.selectJournalRows(rows, opt, TODAY);
  const data = J.buildJournalData(sel.rows, null);
  const t0 = Date.now();
  await save('big', React.createElement(PeriodJournalExecutivePDF, { periodLabel: 'يوليو 2026', viewLevel: 'DETAILED', grandTotal: data.grandTotal, totalEntries: data.filteredCount, bankGroups: data.bankGroups, signature: true, printedBy: 'x', printedAt: 'y' }));
  console.log(n, 'rows', data.bankGroups.length, 'groups: render ms', Date.now() - t0, 'estimate pages', J.estimateJournalPages({ level: 'DETAILED', groups: g, rows: n, signature: true }));
}
