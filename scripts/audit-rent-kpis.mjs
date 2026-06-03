/**
 * تحقق محلي من منطق مؤشرات الإيجار (بدون قاعدة بيانات)
 * node scripts/audit-rent-kpis.mjs
 */
import {
  buildMallRentDashboardModel,
  dedupeRentChargesByContractMonth,
} from '../src/lib/mall-rent-collection-series.ts';

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const charges = [
  { contract_id: 'c1', amount: 5000, total_paid: 5000, due_date: '2026-01-01', status: 'PAID' },
  { contract_id: 'c1', amount: 5000, total_paid: 5000, due_date: '2026-01-01', status: 'PAID' },
  { contract_id: 'c1', amount: 5000, total_paid: 2500, due_date: '2026-02-01', status: 'PARTIAL' },
  { contract_id: 'c2', amount: 3000, total_paid: 3000, due_date: '2026-02-01', status: 'PAID' },
];

const deduped = dedupeRentChargesByContractMonth(charges);
assert(deduped.length === 3, `dedupe count expected 3 got ${deduped.length}`);

const model = buildMallRentDashboardModel(charges, 2026, new Date('2026-06-15'));
assert(model.duplicateCount === 1, `duplicateCount expected 1 got ${model.duplicateCount}`);
assert(model.yearKpis.billed === 13000, `ytd billed expected 13000 got ${model.yearKpis.billed}`);
assert(model.yearKpis.collected === 10500, `ytd collected expected 10500 got ${model.yearKpis.collected}`);
assert(
  Math.abs(model.yearKpis.rate - (10500 / 13000) * 100) < 0.01,
  `rate expected ~80.77 got ${model.yearKpis.rate}`,
);

console.log('✅ rent KPI aggregation tests passed');
console.log(JSON.stringify({ yearKpis: model.yearKpis, last6Kpis: model.last6Kpis }, null, 2));
