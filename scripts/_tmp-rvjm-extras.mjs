import { rows, props, save, o, React, PeriodJournalExecutivePDF, J, TODAY, OUT } from './_tmp-rvjm-render.mjs';
const extras = (sig, note = 'التصفية: الجهة: محل الأمل للملابس · طريقة الدفع: نقدي') => ({ scopeNote: note, printedBy: 'المحاسب', printedAt: '19/10/2026 14:30', signature: sig });
const cases = {
  'e1-sum-sig': [o(), true],
  'e2-det-sig': [o({ level: 'DETAILED' }), true],
  'e3-det-year-sig': [o({ level: 'DETAILED', period: { ...o().period, months: [1,2,3,4,5,6,7,8,9,10,11,12] } }), true],
  'e4-sum-nosig': [o(), false],
};
for (const [name, [opt, sig]] of Object.entries(cases)) {
  const { pdf, data } = props(opt, null);
  const size = await save(name, React.createElement(PeriodJournalExecutivePDF, { ...pdf, ...extras(sig) }));
  console.log(name, data.filteredCount, size);
}
