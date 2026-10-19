// temporary harness: renders the revenues / expenses report at default options from the mock rows
import React from 'react';
import fs from 'node:fs';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { RevenuesReportPDF } from '../src/features/pdf/RevenuesReportPDF.tsx';
import { ExpensesReportPDF } from '../src/features/pdf/ExpensesReportPDF.tsx';

const OUT = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/qa-pdfoptions/pdf';
const prefix = process.argv[2] || 'before';
const SEL = 'category:categories(id,code,name_ar,kind,color),cashbox:cashboxes(id,code,name_ar,kind,bank_name),contact:contacts(id,name,kind,shop_number)';
const get = async (kind) => {
  const r = await fetch(`http://127.0.0.1:54399/rest/v1/transactions?select=*,${SEL}&kind=eq.${kind}&order=created_at.desc,number.desc`, { headers: { apikey: 'x' } });
  return r.json();
};
const rev = await get('REVENUE');
const exp = await get('EXPENSE');
console.log('rows', rev.length, exp.length);
const save = async (name, Comp, props) => {
  const blob = await renderPdfBlob(async () => React.createElement(Comp, props));
  fs.writeFileSync(`${OUT}/${prefix}-${name}.pdf`, Buffer.from(await blob.arrayBuffer()));
  console.log('wrote', name, blob.size);
};
await save('rev-default', RevenuesReportPDF, { titleAr: 'كشف الإيرادات التفصيلي', subtitleAr: 'كامل المدة المسجلة · كافة بنود الإيرادات', rows: rev, groupByPaymentMethod: true, includeSummaries: true, periodLabel: 'كامل المدة المسجلة', categoriesLabel: 'كافة بنود الإيرادات' });
await save('exp-default', ExpensesReportPDF, { titleAr: 'كشف المصروفات التفصيلي', subtitleAr: 'كامل المدة المسجلة · كافة البنود', rows: exp, groupByPaymentMethod: true, includeSummaries: true, periodLabel: 'كامل المدة المسجلة', categoriesLabel: 'كافة البنود' });
await save('rev-nosummary', RevenuesReportPDF, { titleAr: 'كشف الإيرادات التفصيلي', subtitleAr: 'x', rows: rev.slice(0, 9), groupByPaymentMethod: true, includeSummaries: false, periodLabel: 'شهور: مارس (2026)', categoriesLabel: 'إيجارات المحلات' });
await save('exp-empty', ExpensesReportPDF, { titleAr: 'كشف المصروفات التفصيلي', subtitleAr: 'x', rows: [], includeSummaries: true });
