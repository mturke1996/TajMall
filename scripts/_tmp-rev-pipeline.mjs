// temporary review harness: the dialog's option pipeline (src/lib/report-options.ts) -> the report components -> PDF -> text/png
import React from 'react';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderPdfBlob } from '../src/features/pdf/pdf-blob-utils.ts';
import { RevenuesReportPDF } from '../src/features/pdf/RevenuesReportPDF.tsx';
import { ExpensesReportPDF } from '../src/features/pdf/ExpensesReportPDF.tsx';
import * as R from '../src/lib/report-options.ts';

const OUT = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/qa-pdfoptions/review-pdf';
const { rev, exp } = JSON.parse(fs.readFileSync(`${OUT}/snapshot.json`, 'utf8'));
const TODAY = '2026-10-19';

const build = (kind, rows, options, extra = {}) => {
  const text = R.REPORT_KIND_TEXT[kind];
  const selection = R.selectReportRows(rows, options, TODAY);
  const summary = R.summarizeRows(selection.rows);
  const groups = R.groupTransactions(selection.rows, options.layout.grouping, options.layout.sort);
  const layout = options.layout;
  const filters = options.filters;
  const names = {
    party: new Map(rows.filter((r) => r.contact).map((r) => [r.contact.id, r.contact.name])),
    cashbox: new Map(rows.filter((r) => r.cashbox).map((r) => [r.cashbox.id, r.cashbox.name_ar])),
  };
  const scopeNote = R.buildScopeNote({ filters, layout, partyName: (id) => names.party.get(id), cashboxName: (id) => names.cashbox.get(id) });
  const scopeLabel = R.categoriesLabel(filters.categoryIds, (id) => rows.find((r) => r.category?.id === id)?.category?.name_ar, text.allCategories);
  const periodLabel = selection.period.label;
  const props = {
    titleAr: layout.title.trim() || text.defaultTitle,
    subtitleAr: layout.subtitle.trim() || `${periodLabel} · ${scopeLabel}`,
    rows: selection.rows,
    grandTotal: summary.total,
    totalTransactionsCount: summary.count,
    groupByPaymentMethod: true,
    includeSummaries: layout.includeSummaries,
    periodLabel,
    categoriesLabel: scopeLabel,
    paymentMethodGroups: layout.grouping === 'METHOD' ? undefined : R.toPdfGroups(groups),
    groupCaptionAr: R.groupCaption(kind, layout.grouping),
    groupSubtotals: layout.grouping !== 'NONE',
    scopeNote: scopeNote || undefined,
    printedBy: 'المحاسب',
    printedAt: R.formatPrintStamp(),
    signature: layout.signature,
    ...extra,
  };
  return { selection, summary, groups, props, text, scopeNote };
};

const render = async (kind, props) => {
  const Comp = kind === 'REVENUE' ? RevenuesReportPDF : ExpensesReportPDF;
  const blob = await renderPdfBlob(async () => React.createElement(Comp, props));
  return Buffer.from(await blob.arrayBuffer());
};
const pdfText = (buf, name) => {
  const f = `${OUT}/${name}.pdf`;
  fs.writeFileSync(f, buf);
  const txt = execFileSync('pdftotext', ['-layout', f, '-']).toString();
  const pages = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f]).toString())[1]);
  return { txt, pages };
};

export { build, render, pdfText, R, rev, exp, TODAY, OUT };
