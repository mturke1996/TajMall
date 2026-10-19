import React from 'react';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { RevenuesReportPDF } from '../src/features/pdf/RevenuesReportPDF.tsx';
const OUT = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/qa-pdfoptions/pdf';
const { rev } = JSON.parse(fs.readFileSync(`${OUT}/snapshot.json`, 'utf8'));
const mk = (n, methodsCount) => Array.from({ length: n }, (_, i) => ({ ...rev[i % rev.length], id: `x${i}`, number: 2000 + i, method: ['CASH', 'TRANSFER', 'CHEQUE', 'CARD'][i % methodsCount] }));
const pagesOf = async (props) => {
  const blob = await renderPdfBlob(async () => React.createElement(RevenuesReportPDF, props));
  fs.writeFileSync(`${OUT}/tmp-pages.pdf`, Buffer.from(await blob.arrayBuffer()));
  return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [`${OUT}/tmp-pages.pdf`]).toString())[1]);
};
const sizes = [3, 6, 8, 9, 10, 12, 15, 20, 25, 30, 40, 50, 70, 100, 150];
for (const [label, methods, summaries] of [['1 group, no summary', 1, false], ['3 groups, no summary', 3, false], ['3 groups, summary(3 cats)', 3, true]]) {
  const out = [];
  for (const n of sizes) out.push(`${n}:${await pagesOf({ rows: mk(n, methods), includeSummaries: summaries })}`);
  console.log(label.padEnd(28), out.join('  '));
}
