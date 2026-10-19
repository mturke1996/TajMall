import React from 'react';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { PeriodJournalExecutivePDF } from '../src/features/pdf/PeriodJournalExecutivePDF.tsx';
import { JournalExecutiveDocument } from '../src/features/pdf/options/journal-executive-document.tsx';
import { buildJournalData, estimateJournalPages } from '../src/lib/period-journal-options.ts';
const OUT = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/qa-pdfoptions/journal';
const tx = JSON.parse(fs.readFileSync(`${OUT}/tx.json`, 'utf8')).filter((t) => t.kind === 'REVENUE');
const boxes = [
  { id: 'cb-1', name_ar: 'الخزينة النقدية', kind: 'CASH' },
  { id: 'cb-2', name_ar: 'مصرف الواحة', kind: 'BANK' },
  { id: 'cb-3', name_ar: 'مصرف الجمهورية', kind: 'BANK' },
  { id: 'cb-4', name_ar: 'مصرف الصحاري', kind: 'BANK' },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `cb-${5 + i}`, name_ar: `مصرف ${i + 5}`, kind: 'BANK' })),
];
const mk = (n, g) =>
  Array.from({ length: n }, (_, i) => {
    const base = tx[i % tx.length];
    const b = boxes[i % g];
    return { ...base, id: `x${i}`, number: 5000 + i, cashbox_id: b.id, cashbox: b };
  });
const pagesOf = async (level, n, g, extras) => {
  const data = buildJournalData(mk(n, g), null);
  const props = { periodLabel: 'كامل عام 2026', viewLevel: level, grandTotal: data.grandTotal, totalEntries: data.filteredCount, bankGroups: data.bankGroups, categoriesSummary: data.categoriesSummary, paymentMethodsSummary: data.paymentMethodsSummary, priorPeriodTotal: data.priorPeriodTotal, priorPeriodCount: data.priorPeriodCount, currentPeriodTotal: data.currentPeriodTotal, currentPeriodCount: data.currentPeriodCount, futurePeriodTotal: data.futurePeriodTotal, futurePeriodCount: data.futurePeriodCount };
  const blob = await renderPdfBlob(async () => React.createElement(JournalExecutiveDocument, { ...props, extras }));
  fs.writeFileSync(`${OUT}/tmp-calib.pdf`, Buffer.from(await blob.arrayBuffer()));
  return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [`${OUT}/tmp-calib.pdf`]).toString())[1]);
};
const pr = { printedBy: 'المحاسب', printedAt: '19/10/2026 18:00' };
const sig = { ...pr, signature: true };
let bad = 0, total = 0;
const rows = [];
for (const [level, gs, ns] of [['SUMMARY_ONLY', [1, 2, 3, 4, 6, 8, 12], [12]], ['DETAILED', [1, 2, 4, 6], [4, 8, 9, 10, 14, 20, 26, 30, 45, 60, 90, 130]]]) {
  for (const g of gs) for (const n of ns) {
    if (g > n) continue;
    for (const [lab, ex, s2] of [['print', pr, false], ['sig', sig, true]]) {
      const real = await pagesOf(level, n, g, ex);
      const est = estimateJournalPages({ level, groups: g, rows: n, signature: s2 });
      total += 1; if (real !== est) { bad += 1; rows.push(`${level} g=${g} n=${n} ${lab}: real ${real} est ${est}`); }
    }
  }
}
console.log(`mismatches ${bad}/${total}`); console.log(rows.join('\n'));
