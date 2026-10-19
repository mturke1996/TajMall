import { build, render, pdfText, R, rev, exp, TODAY, OUT } from './_tmp-rev-pipeline.mjs';
import { execFileSync } from 'node:child_process';
const opts = (p = {}) => { const b = R.defaultReportOptions(TODAY); return { period: { ...b.period, ...(p.period ?? {}) }, filters: { ...b.filters, ...(p.filters ?? {}) }, layout: { ...b.layout, ...(p.layout ?? {}) } }; };
const statuses = {};
for (const r of [...rev, ...exp]) statuses[r.status] = (statuses[r.status] || 0) + 1;
console.log('statuses', statuses, 'methods', [...new Set([...rev, ...exp].map((r) => r.method))], 'dates', rev.map(r=>r.tx_date).sort()[0], rev.map(r=>r.tx_date).sort().at(-1));
const combos = [
  ['rev-default', 'REVENUE', rev, opts()],
  ['rev-party-signed', 'REVENUE', rev, opts({ layout: { grouping: 'PARTY', signature: true, sort: 'AMOUNT_DESC' } })],
  ['rev-none-asc-nosum', 'REVENUE', rev, opts({ layout: { grouping: 'NONE', sort: 'DATE_ASC', includeSummaries: false } })],
  ['rev-month', 'REVENUE', rev, opts({ layout: { grouping: 'MONTH', sort: 'DATE_ASC' } })],
  ['exp-category-cash', 'EXPENSE', exp, opts({ layout: { grouping: 'CATEGORY' }, filters: { methods: ['CASH'] } })],
  ['exp-cashbox-range', 'EXPENSE', exp, opts({ period: { mode: 'RANGE', from: '2026-03-01', to: '2026-04-30' }, layout: { grouping: 'CASHBOX' }, filters: { minAmount: '1000', maxAmount: '50000' } })],
];
for (const [name, kind, rows, o] of combos) {
  const { selection, summary, groups, props, scopeNote } = build(kind, rows, o);
  const buf = await render(kind, props);
  const { txt, pages } = pdfText(buf, name);
  const nums = (txt.match(/#\d{3,}/g) || []).length;
  console.log(name.padEnd(22), 'rows', selection.rows.length, 'pdf #nums', nums, 'pages', pages, 'est', R.estimatePages({ rows: summary.count, groups: groups.length, includeSummaries: o.layout.includeSummaries, summaryRows: summary.categories, signature: o.layout.signature }), 'total', summary.total, 'groups', groups.map((g) => `${g.label}:${g.count}:${g.total}`).join(' | '), '\n   note:', scopeNote);
}
