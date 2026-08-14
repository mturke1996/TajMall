/**
 * فحص تحصيل إيجار مكرر / زائد لنفس العقد والشهر
 * node scripts/audit-duplicate-rent-collections.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim().replace(/^"|"$/g, '');
      return [k, v];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function fetchAll(table, select, filters = (q) => q) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    let q = sb.from(table).select(select).range(from, from + pageSize - 1);
    q = filters(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchInChunks(table, select, ids, idCol = 'id') {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await sb.from(table).select(select).in(idCol, chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

function money(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

const charges = await fetchAll(
  'tenant_charges',
  'id, contract_id, amount, total_paid, due_date, status, type, description, created_at',
  (q) => q.eq('type', 'RENT').order('due_date'),
);

const byKey = new Map();
for (const c of charges) {
  const month = String(c.due_date).slice(0, 7);
  const k = `${c.contract_id}|${month}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(c);
}
const dupCharges = [...byKey.entries()].filter(([, rows]) => rows.length > 1);
const overpaid = charges.filter((c) => Number(c.total_paid || 0) > Number(c.amount || 0) + 0.009);

const links = await fetchAll(
  'tenant_rent_journal_links',
  'id, charge_id, journal_entry_id, amount, created_at',
);
const linkSumByCharge = new Map();
const linksByCharge = new Map();
for (const l of links) {
  linkSumByCharge.set(l.charge_id, (linkSumByCharge.get(l.charge_id) || 0) + Number(l.amount || 0));
  if (!linksByCharge.has(l.charge_id)) linksByCharge.set(l.charge_id, []);
  linksByCharge.get(l.charge_id).push(l);
}
const overLinked = charges.filter(
  (c) => (linkSumByCharge.get(c.id) || 0) > Number(c.amount || 0) + 0.009,
);

const contracts = await fetchAll(
  'lease_contracts',
  'id, tenant_id, unit_id, monthly_rent, status',
);
const contractMap = new Map(contracts.map((c) => [c.id, c]));
const tenantIds = [...new Set(contracts.map((c) => c.tenant_id).filter(Boolean))];
const tenants = await fetchInChunks('contacts', 'id, name, shop_number', tenantIds);
const tenantMap = new Map(tenants.map((t) => [t.id, t]));

const jeIds = [...new Set(links.map((l) => l.journal_entry_id).filter(Boolean))];
const journals = await fetchInChunks(
  'journal_entries',
  'id, source_type, source_id, entry_date, created_at',
  jeIds,
);
const jeMap = new Map(journals.map((j) => [j.id, j]));

const txSourceIds = [
  ...new Set(
    journals.filter((j) => j.source_type === 'TRANSACTION' && j.source_id).map((j) => j.source_id),
  ),
];
const txs = await fetchInChunks(
  'transactions',
  'id, contact_id, amount, tx_date, description, method, created_at, kind',
  txSourceIds,
);
const txMap = new Map(txs.map((t) => [t.id, t]));

const { data: rentCats, error: catErr } = await sb
  .from('categories')
  .select('id, code, name')
  .or('code.eq.REV-RNT,code.ilike.%RENT%,name.ilike.%إيجار%');
if (catErr) throw new Error(`categories: ${catErr.message}`);
const rentCategoryIds = (rentCats || []).map((c) => c.id);

let allRentTxs = [];
if (rentCategoryIds.length) {
  allRentTxs = await fetchAll(
    'transactions',
    'id, contact_id, amount, tx_date, description, method, created_at, category_id, auto_allocate_charges',
    (q) => q.eq('kind', 'REVENUE').in('category_id', rentCategoryIds).order('tx_date'),
  );
}

const monthPayments = new Map();
for (const [k, rows] of byKey) {
  const chargeIds = rows.map((r) => r.id);
  const monthLinks = chargeIds.flatMap((id) => linksByCharge.get(id) || []);
  const totalLinked = monthLinks.reduce((s, l) => s + Number(l.amount || 0), 0);
  const chargeAmountSum = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const maxChargeAmount = Math.max(...rows.map((r) => Number(r.amount || 0)), 0);
  const totalPaidSum = rows.reduce((s, r) => s + Number(r.total_paid || 0), 0);
  const txIds = new Set();
  for (const l of monthLinks) {
    const je = jeMap.get(l.journal_entry_id);
    if (je?.source_type === 'TRANSACTION' && je.source_id) txIds.add(je.source_id);
  }
  monthPayments.set(k, {
    chargeCount: rows.length,
    chargeIds,
    charges: rows,
    linkCount: monthLinks.length,
    totalLinked,
    chargeAmountSum,
    maxChargeAmount,
    totalPaidSum,
    txIds: [...txIds],
    overCollected: totalLinked > maxChargeAmount + 0.009,
    overPaidField: totalPaidSum > maxChargeAmount + 0.009,
  });
}

const overCollectedMonths = [...monthPayments.entries()].filter(([, v]) => v.overCollected);
const multiTxMonths = [...monthPayments.entries()].filter(([, v]) => v.txIds.length > 1);
const multiTxAndOver = multiTxMonths.filter(([, v]) => v.overCollected);

// Tenant-level: multiple REV-RNT txs whose linked months overlap and sum > rent
function label(contractId) {
  const c = contractMap.get(contractId);
  const t = c ? tenantMap.get(c.tenant_id) : null;
  return {
    tenant: t?.name || '?',
    shop: t?.shop_number || '',
    tenant_id: c?.tenant_id || null,
    contract_status: c?.status || null,
    monthly_rent: c?.monthly_rent != null ? Number(c.monthly_rent) : null,
  };
}

const report = {
  audited_at: new Date().toISOString(),
  supabase_url: url,
  totals: {
    rentCharges: charges.length,
    journalLinks: links.length,
    rentRevenueTransactions: allRentTxs.length,
    duplicateContractMonths: dupCharges.length,
    overpaidCharges: overpaid.length,
    overLinkedCharges: overLinked.length,
    overCollectedMonths: overCollectedMonths.length,
    multiPaymentMonths: multiTxMonths.length,
    multiPaymentAndOverCollected: multiTxAndOver.length,
  },
  duplicateCharges: dupCharges.map(([k, rows]) => {
    const [contract_id, month] = k.split('|');
    const meta = label(contract_id);
    const pay = monthPayments.get(k);
    return {
      contract_id,
      month,
      ...meta,
      charge_count: rows.length,
      charges: rows.map((r) => ({
        id: r.id,
        amount: money(r.amount),
        total_paid: money(r.total_paid),
        status: r.status,
        due_date: r.due_date,
        created_at: r.created_at,
      })),
      total_linked: money(pay?.totalLinked),
      payment_tx_count: pay?.txIds.length ?? 0,
    };
  }),
  overCollected: overCollectedMonths.map(([k, v]) => {
    const [contract_id, month] = k.split('|');
    const meta = label(contract_id);
    return {
      contract_id,
      month,
      ...meta,
      expected_rent: money(v.maxChargeAmount),
      total_linked: money(v.totalLinked),
      excess: money(v.totalLinked - v.maxChargeAmount),
      charge_count: v.chargeCount,
      payment_tx_count: v.txIds.length,
      payments: v.txIds.map((id) => {
        const t = txMap.get(id);
        return t
          ? {
              id: t.id,
              amount: money(t.amount),
              date: t.tx_date,
              desc: t.description,
              method: t.method,
            }
          : { id };
      }),
    };
  }),
  multiPayments: multiTxMonths.map(([k, v]) => {
    const [contract_id, month] = k.split('|');
    const meta = label(contract_id);
    return {
      contract_id,
      month,
      ...meta,
      expected_rent: money(v.maxChargeAmount),
      total_linked: money(v.totalLinked),
      excess: money(Math.max(0, v.totalLinked - v.maxChargeAmount)),
      over_collected: v.overCollected,
      charge_count: v.chargeCount,
      payment_tx_count: v.txIds.length,
      payments: v.txIds.map((id) => {
        const t = txMap.get(id);
        return t
          ? {
              id: t.id,
              amount: money(t.amount),
              date: t.tx_date,
              desc: t.description,
              method: t.method,
            }
          : { id };
      }),
    };
  }),
  overpaidCharges: overpaid.map((c) => {
    const meta = label(c.contract_id);
    return {
      charge_id: c.id,
      contract_id: c.contract_id,
      month: String(c.due_date).slice(0, 7),
      ...meta,
      amount: money(c.amount),
      total_paid: money(c.total_paid),
      excess: money(Number(c.total_paid) - Number(c.amount)),
      status: c.status,
    };
  }),
};

const outPath = resolve(__dir, '../tmp-rent-duplicate-audit.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

console.log('=== ملخص فحص تحصيل الإيجار المكرر ===');
console.log(JSON.stringify(report.totals, null, 2));
console.log(`\nFull report: ${outPath}`);

if (report.overCollected.length) {
  console.log('\n--- أشهر بتحصيل زائد (مرتبطة بأكثر من الإيجار) ---');
  for (const row of report.overCollected.slice(0, 30)) {
    console.log(
      `${row.tenant} | محل ${row.shop || '-'} | ${row.month} | متوقع ${row.expected_rent} | محصّل ${row.total_linked} | زيادة ${row.excess} | دفعات ${row.payment_tx_count}`,
    );
  }
}

if (report.duplicateCharges.length) {
  console.log('\n--- مطالبات مكررة (نفس العقد+الشهر) ---');
  for (const row of report.duplicateCharges.slice(0, 30)) {
    console.log(
      `${row.tenant} | محل ${row.shop || '-'} | ${row.month} | مطالبات ${row.charge_count} | مرتبط ${row.total_linked}`,
    );
  }
}

if (report.multiPayments.length) {
  console.log('\n--- أشهر بأكثر من دفعة واحدة ---');
  for (const row of report.multiPayments.slice(0, 40)) {
    const flag = row.over_collected ? ' [زيادة]' : ' [تقسيط/جزئي]';
    console.log(
      `${row.tenant} | محل ${row.shop || '-'} | ${row.month} | دفعات ${row.payment_tx_count} | محصّل ${row.total_linked}/${row.expected_rent}${flag}`,
    );
  }
}

if (
  !report.overCollected.length &&
  !report.duplicateCharges.length &&
  !report.overpaidCharges.length
) {
  console.log('\nلا توجد مطالبات مكررة ولا تحصيل زائد مرتبط بالأشهر.');
}
