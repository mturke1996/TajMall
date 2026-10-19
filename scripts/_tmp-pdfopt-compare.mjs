// temporary: renders the ORIGINAL report components (git HEAD copies) and the current ones with the same frozen data and compares them
import React from 'react';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { RevenuesReportPDF as RevNew } from '../src/features/pdf/RevenuesReportPDF.tsx';
import { ExpensesReportPDF as ExpNew } from '../src/features/pdf/ExpensesReportPDF.tsx';
import { RevenuesReportPDF as RevOld } from '../src/features/pdf/_tmpOrigRevenuesReportPDF.tsx';
import { ExpensesReportPDF as ExpOld } from '../src/features/pdf/_tmpOrigExpensesReportPDF.tsx';

const OUT = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/qa-pdfoptions/pdf';
const SNAP = `${OUT}/snapshot.json`;
const SEL = 'category:categories(id,code,name_ar,kind,color),cashbox:cashboxes(id,code,name_ar,kind,bank_name),contact:contacts(id,name,kind,shop_number)';
if (!fs.existsSync(SNAP)) {
  const get = async (kind) => (await fetch(`http://127.0.0.1:54399/rest/v1/transactions?select=*,${SEL}&kind=eq.${kind}&order=created_at.desc,number.desc`, { headers: { apikey: 'x' } })).json();
  fs.writeFileSync(SNAP, JSON.stringify({ rev: await get('REVENUE'), exp: await get('EXPENSE') }));
}
const { rev, exp } = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
console.log('rows', rev.length, exp.length);

const norm = (buf) =>
  Buffer.from(buf)
    .toString('latin1')
    .replace(/\/CreationDate \(D:[^)]*\)/g, '')
    .replace(/\(D:\d{14}Z\)/g, '')
    .replace(/\/ID \[[^\]]*\]/g, '')
    .replace(/\/[A-Z]{6}\+/g, '/AAAAAA+');
// the object order inside a PDF file is not stable between runs, so what is compared is what is drawn: every page as an image and the text
const pages = (buf, tag) => {
  const dir = `${OUT}/tmp-${tag}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/f.pdf`, buf);
  execFileSync('pdftoppm', ['-r', '70', '-png', `${dir}/f.pdf`, `${dir}/p`]);
  const imgs = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => crypto.createHash('md5').update(fs.readFileSync(`${dir}/${f}`)).digest('hex'));
  const text = execFileSync('pdftotext', ['-layout', `${dir}/f.pdf`, '-']).toString();
  fs.rmSync(dir, { recursive: true, force: true });
  return { imgs, text };
};
const render = async (Comp, props) => Buffer.from(await (await renderPdfBlob(async () => React.createElement(Comp, props))).arrayBuffer());

const cases = [
  ['rev-default', RevOld, RevNew, { titleAr: 'كشف الإيرادات التفصيلي', subtitleAr: 'كامل المدة المسجلة · كافة بنود الإيرادات', rows: rev, groupByPaymentMethod: true, includeSummaries: true, periodLabel: 'كامل المدة المسجلة', categoriesLabel: 'كافة بنود الإيرادات' }],
  ['exp-default', ExpOld, ExpNew, { titleAr: 'كشف المصروفات التفصيلي', subtitleAr: 'كامل المدة المسجلة · كافة البنود', rows: exp, groupByPaymentMethod: true, includeSummaries: true, periodLabel: 'كامل المدة المسجلة', categoriesLabel: 'كافة البنود' }],
  ['rev-nosummary', RevOld, RevNew, { titleAr: 'كشف الإيرادات التفصيلي', subtitleAr: 'x', rows: rev.slice(0, 9), groupByPaymentMethod: true, includeSummaries: false, periodLabel: 'شهور: مارس (2026)', categoriesLabel: 'إيجارات المحلات' }],
  ['exp-few', ExpOld, ExpNew, { titleAr: 'كشف', subtitleAr: 'x', rows: exp.slice(0, 3), includeSummaries: true }],
  ['exp-empty', ExpOld, ExpNew, { titleAr: 'كشف المصروفات التفصيلي', subtitleAr: 'x', rows: [], includeSummaries: true }],
  ['rev-empty', RevOld, RevNew, { rows: [] }],
  ['rev-bare', RevOld, RevNew, { transactions: rev.slice(0, 30), grandTotal: 12345.678, totalTransactionsCount: 30 }],
];
let bad = 0;
for (const [name, Old, New, props] of cases) {
  const a1 = await render(Old, props);
  const a2 = await render(Old, props);
  const b = await render(New, props);
  const p1 = pages(a1, 'a');
  const p2 = pages(a2, 'b');
  const p3 = pages(b, 'c');
  const stable = JSON.stringify(p1) === JSON.stringify(p2);
  const same = JSON.stringify(p1) === JSON.stringify(p3);
  const raw = norm(a1) === norm(b);
  console.log(name.padEnd(14), 'orig-stable:', stable, ' pages+text identical:', same, ' bytes identical:', raw, ` (${p1.imgs.length} pages)`);
  if (!same) bad += 1;
  if (!same || process.env.KEEP) {
    fs.writeFileSync(`${OUT}/cmp-${name}-old.pdf`, a1);
    fs.writeFileSync(`${OUT}/cmp-${name}-new.pdf`, b);
  }
}
console.log(bad ? `${bad} case(s) differ` : 'all default renders are identical to the originals');
