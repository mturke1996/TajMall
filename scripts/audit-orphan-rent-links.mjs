/**
 * روابط إيجار مرتبطة بقيود ملغاة/محذوفة — سبب شائع للتحصيل المزدوج الظاهر
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dir, '../.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

async function fetchAll(table, select) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function fetchIn(table, select, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await sb.from(table).select(select).in('id', chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

const links = await fetchAll(
  'tenant_rent_journal_links',
  'id, charge_id, journal_entry_id, amount, created_at',
);
const jeIds = [...new Set(links.map((l) => l.journal_entry_id))];
const journals = await fetchIn(
  'journal_entries',
  'id, number, status, source_type, source_id, description, entry_date, reversed_at',
  jeIds,
);
const jeMap = new Map(journals.map((j) => [j.id, j]));

const chargeIds = [...new Set(links.map((l) => l.charge_id))];
const charges = await fetchIn(
  'tenant_charges',
  'id, contract_id, amount, total_paid, due_date, status, type',
  chargeIds,
);
const chargeMap = new Map(charges.map((c) => [c.id, c]));

const contracts = await fetchIn(
  'lease_contracts',
  'id, tenant_id, monthly_rent, status',
  [...new Set(charges.map((c) => c.contract_id).filter(Boolean))],
);
const contractMap = new Map(contracts.map((c) => [c.id, c]));
const tenants = await fetchIn(
  'contacts',
  'id, name, shop_number',
  [...new Set(contracts.map((c) => c.tenant_id).filter(Boolean))],
);
const tenantMap = new Map(tenants.map((t) => [t.id, t]));

const badLinks = [];
for (const l of links) {
  const je = jeMap.get(l.journal_entry_id);
  if (!je) {
    badLinks.push({ ...l, reason: 'JOURNAL_MISSING' });
    continue;
  }
  if (je.status === 'REVERSED' || je.status === 'VOID' || je.reversed_at) {
    badLinks.push({
      ...l,
      reason: `JOURNAL_${je.status || 'REVERSED'}`,
      journal_number: je.number,
      journal_status: je.status,
      journal_desc: je.description,
      entry_date: je.entry_date,
      source_id: je.source_id,
    });
  }
}

// Recompute over-collection excluding bad links
const activeLinkSum = new Map();
for (const l of links) {
  const je = jeMap.get(l.journal_entry_id);
  if (!je || je.status === 'REVERSED' || je.status === 'VOID' || je.reversed_at) continue;
  activeLinkSum.set(l.charge_id, (activeLinkSum.get(l.charge_id) || 0) + Number(l.amount || 0));
}

const stillOver = [];
for (const c of charges) {
  if (c.type !== 'RENT') continue;
  const sum = activeLinkSum.get(c.id) || 0;
  if (sum > Number(c.amount || 0) + 0.009) {
    stillOver.push({
      charge_id: c.id,
      month: String(c.due_date).slice(0, 7),
      amount: Number(c.amount),
      active_linked: sum,
      excess: Math.round((sum - Number(c.amount)) * 1000) / 1000,
      total_paid: Number(c.total_paid),
    });
  }
}

const enrichedBad = badLinks.map((l) => {
  const ch = chargeMap.get(l.charge_id);
  const ct = ch ? contractMap.get(ch.contract_id) : null;
  const tn = ct ? tenantMap.get(ct.tenant_id) : null;
  return {
    link_id: l.id,
    reason: l.reason,
    amount: Number(l.amount),
    journal_number: l.journal_number,
    journal_status: l.journal_status,
    journal_desc: l.journal_desc,
    entry_date: l.entry_date,
    month: ch ? String(ch.due_date).slice(0, 7) : null,
    charge_amount: ch ? Number(ch.amount) : null,
    charge_total_paid: ch ? Number(ch.total_paid) : null,
    charge_status: ch?.status,
    tenant: tn?.name || '?',
    shop: tn?.shop_number || '',
    contract_id: ch?.contract_id,
    charge_id: l.charge_id,
    journal_entry_id: l.journal_entry_id,
  };
});

const report = {
  totals: {
    all_links: links.length,
    orphan_or_reversed_links: badLinks.length,
    orphan_amount_sum: badLinks.reduce((s, l) => s + Number(l.amount || 0), 0),
    true_over_after_excluding_reversed: stillOver.length,
  },
  bad_links: enrichedBad,
  still_over_after_fix: stillOver,
};

writeFileSync(
  resolve(__dir, '../tmp-orphan-rent-links.json'),
  JSON.stringify(report, null, 2),
  'utf8',
);

console.log(JSON.stringify(report.totals, null, 2));
console.log('\n--- روابط يتيمة/ملغاة ---');
for (const r of enrichedBad) {
  console.log(
    `${r.tenant} | محل ${r.shop || '-'} | ${r.month} | ${r.amount} | ${r.reason} | قيد #${r.journal_number ?? '?'} | ${r.journal_desc || ''}`,
  );
}
if (!stillOver.length) {
  console.log('\nبعد استبعاد الروابط الملغاة: لا يوجد تحصيل زائد حقيقي.');
} else {
  console.log('\nتحصيل زائد حقيقي بعد التصحيح:');
  console.log(JSON.stringify(stillOver, null, 2));
}
