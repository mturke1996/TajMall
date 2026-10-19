import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { rows as _r, save, J, R, React, PeriodJournalExecutivePDF, OUT, o, TODAY } from './_tmp-rvjm-render.mjs';
const mk = (n, groups) => Array.from({ length: n }, (_, i) => {
  const cb = { id: `cb${i % groups}`, name_ar: `مصرف رقم ${i % groups}`, kind: i % groups === 0 ? 'CASH' : 'BANK' };
  return { id: `s${i}`, number: 100 + i, kind: 'REVENUE', status: 'POSTED', method: 'CASH', amount: String(100 + i), tx_date: '2026-07-' + String(1 + (i % 28)).padStart(2, '0'), description: i % 3 ? 'إيجار شهر يوليو' : 'إيجار شهر مايو', category_id: 'c', category: { id: 'c', code: 'C', name_ar: 'إيجار' }, cashbox_id: cb.id, cashbox: cb, contact: { id: 'p' + (i % 9), name: 'محل ' + i, shop_number: String(i) } };
});
const out = [];
for (const level of ['SUMMARY_ONLY', 'DETAILED']) {
  for (const [n, groups] of level === 'SUMMARY_ONLY' ? [[10, 1], [10, 2], [20, 3], [30, 6], [40, 12]] : [[5, 1], [12, 1], [30, 1], [60, 2], [100, 3], [20, 4]]) {
    for (const sig of [false, true]) {
      const rows = mk(n, groups);
      const opt = { ...J.defaultJournalOptions(TODAY, { period: { year: 2026, month: 7 } }), level };
      const sel = J.selectJournalRows(rows, opt, TODAY);
      const data = J.buildJournalData(sel.rows, null);
      const estimate = J.estimateJournalPages({ level, groups: data.bankGroups.length, rows: data.filteredCount, signature: sig });
      const periodLabel = 'يوليو 2026';
      const el = React.createElement(PeriodJournalExecutivePDF, { periodLabel, categoryLabel: 'كافة بنود الإيرادات', basisLabel: 'x', viewLevel: level, grandTotal: data.grandTotal, totalEntries: data.filteredCount, priorPeriodTotal: data.priorPeriodTotal, priorPeriodCount: data.priorPeriodCount, currentPeriodTotal: data.currentPeriodTotal, currentPeriodCount: data.currentPeriodCount, bankGroups: data.bankGroups, printedBy: 'المحاسب', printedAt: '19/10/2026 14:30', signature: sig, scopeNote: null });
      const name = `pg-${level}-${n}-${groups}-${sig}`;
      await save(name, el);
      const pages = Number(execSync(`pdfinfo ${OUT}/${name}.pdf | grep Pages | awk '{print $2}'`).toString().trim());
      out.push(`${level} rows=${n} groups=${groups} sig=${sig}: real=${pages} est=${estimate} ${pages === estimate ? '' : '<<< off by ' + (estimate - pages)}`);
    }
  }
}
console.log(out.join('\n'));
