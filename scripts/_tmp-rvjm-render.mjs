// temporary review harness (delete after use): renders the period journal PDF for option combinations
import React from 'react';
import fs from 'node:fs';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { PeriodJournalExecutivePDF } from '../src/features/pdf/PeriodJournalExecutivePDF.tsx';
import * as J from '../src/lib/period-journal-options.ts';
import * as R from '../src/lib/report-options.ts';

const OUT = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/rv2/pdf';
fs.mkdirSync(OUT, { recursive: true });
const SEL = 'category:categories(id,code,name_ar,kind,color),cashbox:cashboxes(id,code,name_ar,kind,bank_name),contact:contacts(id,name,kind,shop_number)';
const rows = await (await fetch(`http://127.0.0.1:54399/rest/v1/transactions?select=*,${SEL}&order=created_at.desc,number.desc`, { headers: { apikey: 'x' } })).json();
console.log('rows', rows.length);
const TODAY = '2026-10-19';

function props(options, account) {
  const sel = J.selectJournalRows(rows, options, TODAY);
  const data = J.buildJournalData(sel.rows, account);
  const periodLabel = J.journalPeriodLabel(options.period, sel.period);
  const categoryLabel = J.journalCategoryLabel(options.kind, account);
  const basisLabel = J.journalBasisLabel(options.basis);
  return {
    sel, data,
    pdf: {
      titleAr: options.layout.title.trim() || J.JOURNAL_DEFAULT_TITLE,
      subtitleAr: options.layout.subtitle.trim() || `${periodLabel} · ${categoryLabel} · ${basisLabel}`,
      documentTitle: `x - ${periodLabel}`,
      periodLabel, categoryLabel, basisLabel, viewLevel: options.level,
      grandTotal: data.grandTotal, totalEntries: data.filteredCount,
      priorPeriodTotal: data.priorPeriodTotal, priorPeriodCount: data.priorPeriodCount,
      currentPeriodTotal: data.currentPeriodTotal, currentPeriodCount: data.currentPeriodCount,
      futurePeriodTotal: data.futurePeriodTotal, futurePeriodCount: data.futurePeriodCount,
      bankGroups: data.bankGroups, categoriesSummary: data.categoriesSummary, paymentMethodsSummary: data.paymentMethodsSummary,
    },
  };
}
const save = async (name, el) => {
  const blob = await renderPdfBlob(async () => el);
  fs.writeFileSync(`${OUT}/${name}.pdf`, Buffer.from(await blob.arrayBuffer()));
  return blob.size;
};
const o = (patch = {}) => {
  const b = J.defaultJournalOptions(TODAY, { period: { year: 2026, month: 7 } });
  return { ...b, ...patch, filters: { ...b.filters, ...(patch.filters || {}) }, layout: { ...b.layout, ...(patch.layout || {}) } };
};
export { rows, props, save, o, TODAY, J, R, React, PeriodJournalExecutivePDF, OUT };

if (process.argv[2] === 'run') {
  const cases = {
    'a-sum-jul': o(),
    'b-det-jul': o({ level: 'DETAILED' }),
    'c-det-year-rent': o({ level: 'DETAILED', basis: 'RENT_MONTH_TARGET', period: { ...o().period, months: [1,2,3,4,5,6,7,8,9,10,11,12] } }),
    'd-exp-sum-q3': o({ kind: 'EXPENSE', basis: 'GENERAL_ACCRUAL', period: { ...o().period, months: [7,8,9] } }),
  };
  for (const [name, opt] of Object.entries(cases)) {
    const { pdf, data, sel } = props(opt, null);
    const neu = await save(`${name}-after`, React.createElement(PeriodJournalExecutivePDF, pdf));
    console.log(name, 'rows', data.filteredCount, 'total', data.grandTotal, 'groups', data.bankGroups.length, 'after', neu);
  }
}
