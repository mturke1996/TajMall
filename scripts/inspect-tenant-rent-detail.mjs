/**
 * فحص تفصيلي لإيجار مستأجر واحد
 * node scripts/inspect-tenant-rent-detail.mjs "زكريا"
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const q = process.argv[2] || 'زكريا';
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

function money(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

async function fetchIn(table, select, ids, col = 'id') {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    if (!chunk.length) continue;
    const { data, error } = await sb.from(table).select(select).in(col, chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

const { data: tenants, error: tErr } = await sb
  .from('contacts')
  .select('id, name, shop_number, monthly_rent, kind, contract_start, contract_end')
  .ilike('name', `%${q}%`);
if (tErr) throw tErr;
if (!tenants?.length) {
  console.error('لا مستأجر مطابق:', q);
  process.exit(1);
}

const report = [];

for (const tenant of tenants) {
  const { data: contracts, error: cErr } = await sb
    .from('lease_contracts')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('start_date');
  if (cErr) throw cErr;

  const contractIds = (contracts || []).map((c) => c.id);
  const { data: charges, error: chErr } = await sb
    .from('tenant_charges')
    .select('*')
    .in('contract_id', contractIds.length ? contractIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('type', 'RENT')
    .order('due_date');
  if (chErr) throw chErr;

  const chargeIds = (charges || []).map((c) => c.id);
  const { data: links, error: lErr } = await sb
    .from('tenant_rent_journal_links')
    .select('*')
    .in('charge_id', chargeIds.length ? chargeIds : ['00000000-0000-0000-0000-000000000000']);
  if (lErr) throw lErr;

  const { data: allocs, error: aErr } = await sb
    .from('tenant_charge_allocations')
    .select('*')
    .in('charge_id', chargeIds.length ? chargeIds : ['00000000-0000-0000-0000-000000000000']);
  if (aErr) throw aErr;

  const jeIds = [...new Set((links || []).map((l) => l.journal_entry_id))];
  const journals = await fetchIn(
    'journal_entries',
    'id, number, status, source_type, source_id, entry_date, description, reversed_at, posted_at, created_at',
    jeIds,
  );
  const jeMap = new Map(journals.map((j) => [j.id, j]));

  const txIds = [
    ...new Set(
      journals
        .filter((j) => j.source_type === 'TRANSACTION' && j.source_id)
        .map((j) => j.source_id),
    ),
  ];
  const linkedTxs = await fetchIn(
    'transactions',
    'id, number, amount, tx_date, method, description, status, voided_at, category_id, cashbox_id, created_at, posted_at',
    txIds,
  );
  const txMap = new Map(linkedTxs.map((t) => [t.id, t]));

  const { data: cats } = await sb.from('categories').select('id, code').like('code', 'REV-RNT%');
  const catIds = (cats || []).map((c) => c.id);
  const { data: allRentTxs, error: rtErr } = await sb
    .from('transactions')
    .select(
      'id, number, amount, tx_date, method, description, status, voided_at, category_id, cashbox_id, created_at, posted_at, auto_allocate_charges',
    )
    .eq('contact_id', tenant.id)
    .eq('kind', 'REVENUE')
    .in('category_id', catIds.length ? catIds : ['00000000-0000-0000-0000-000000000000'])
    .order('tx_date');
  if (rtErr) throw rtErr;

  const { data: calendar, error: calErr } = await sb.rpc('get_tenant_rent_calendar', {
    p_tenant_id: tenant.id,
    p_year: 2026,
  });
  // ignore calendar errors for older years

  const { data: exempt } = await sb
    .from('tenant_rent_exempt_months')
    .select('*')
    .eq('tenant_id', tenant.id);

  const byMonth = new Map();
  for (const ch of charges || []) {
    const month = String(ch.due_date).slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, { charges: [], links: [], payments: [] });
    byMonth.get(month).charges.push(ch);
  }
  for (const l of links || []) {
    const ch = (charges || []).find((c) => c.id === l.charge_id);
    if (!ch) continue;
    const month = String(ch.due_date).slice(0, 7);
    const je = jeMap.get(l.journal_entry_id);
    const tx = je?.source_type === 'TRANSACTION' ? txMap.get(je.source_id) : null;
    byMonth.get(month)?.links.push({
      link_id: l.id,
      amount: money(l.amount),
      journal_id: l.journal_entry_id,
      journal_number: je?.number,
      journal_status: je?.status,
      reversed_at: je?.reversed_at,
      tx_id: tx?.id || je?.source_id || null,
      tx_number: tx?.number ?? null,
      tx_amount: tx ? money(tx.amount) : null,
      tx_date: tx?.tx_date || je?.entry_date,
      method: tx?.method || null,
      tx_status: tx?.status || null,
      voided_at: tx?.voided_at || null,
      description: tx?.description || je?.description || null,
      created_at: l.created_at,
    });
  }

  const months = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, row]) => {
      const chargeAmount = row.charges.reduce((s, c) => s + Number(c.amount || 0), 0);
      const maxCharge = Math.max(...row.charges.map((c) => Number(c.amount || 0)), 0);
      const totalPaidField = row.charges.reduce((s, c) => s + Number(c.total_paid || 0), 0);
      const activeLinks = row.links.filter(
        (l) => l.journal_status !== 'REVERSED' && l.journal_status !== 'VOID' && !l.reversed_at,
      );
      const reversedLinks = row.links.filter(
        (l) => l.journal_status === 'REVERSED' || l.journal_status === 'VOID' || l.reversed_at,
      );
      const activeLinked = activeLinks.reduce((s, l) => s + l.amount, 0);
      const allLinked = row.links.reduce((s, l) => s + l.amount, 0);
      const distinctActiveTx = new Set(activeLinks.map((l) => l.tx_id).filter(Boolean));

      let verdict = 'OK';
      let note = '';
      if (row.charges.length > 1) {
        verdict = 'DUPLICATE_CHARGE';
        note = `${row.charges.length} مطالبات لنفس الشهر`;
      } else if (reversedLinks.length) {
        verdict = 'ORPHAN_REVERSED_LINK';
        note = 'رابط من قيد ملغى';
      } else if (activeLinked > maxCharge + 0.009) {
        verdict = 'OVER_COLLECTED';
        note = `زيادة ${money(activeLinked - maxCharge)}`;
      } else if (totalPaidField > maxCharge + 0.009) {
        verdict = 'OVER_PAID_FIELD';
        note = `total_paid زائد ${money(totalPaidField - maxCharge)}`;
      } else if (distinctActiveTx.size > 1 && activeLinked <= maxCharge + 0.009) {
        verdict = 'INSTALLMENT_OK';
        note = `تقسيط ${distinctActiveTx.size} دفعات = ${activeLinked}`;
      } else if (activeLinked + 0.009 < maxCharge && row.charges.some((c) => c.status !== 'PAID')) {
        verdict = 'PARTIAL_OR_UNPAID';
        note = `متبقي ${money(maxCharge - activeLinked)}`;
      } else if (Math.abs(activeLinked - maxCharge) <= 0.009) {
        verdict = 'PAID_OK';
        note = 'مسدد بالكامل';
      }

      return {
        month,
        verdict,
        note,
        charge_count: row.charges.length,
        expected_rent: money(maxCharge),
        charge_amount_sum: money(chargeAmount),
        total_paid_field: money(totalPaidField),
        charge_statuses: row.charges.map((c) => c.status),
        active_linked: money(activeLinked),
        all_linked_incl_reversed: money(allLinked),
        active_payment_count: distinctActiveTx.size,
        excess: money(Math.max(0, activeLinked - maxCharge)),
        charges: row.charges.map((c) => ({
          id: c.id,
          amount: money(c.amount),
          total_paid: money(c.total_paid),
          status: c.status,
          due_date: c.due_date,
          description: c.description,
          created_at: c.created_at,
        })),
        payments: activeLinks.sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date))),
        reversed_links: reversedLinks,
      };
    });

  // Rent txs not linked to any month
  const linkedTxIdSet = new Set(txIds);
  const unlinkedRentTxs = (allRentTxs || []).filter(
    (t) => !linkedTxIdSet.has(t.id) && t.status !== 'VOIDED' && !t.voided_at,
  );

  const issues = months.filter((m) =>
    ['DUPLICATE_CHARGE', 'ORPHAN_REVERSED_LINK', 'OVER_COLLECTED', 'OVER_PAID_FIELD'].includes(
      m.verdict,
    ),
  );

  const tenantReport = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      shop: tenant.shop_number,
      monthly_rent_on_contact: tenant.monthly_rent != null ? money(tenant.monthly_rent) : null,
    },
    contracts: (contracts || []).map((c) => ({
      id: c.id,
      status: c.status,
      start_date: c.start_date,
      end_date: c.end_date,
      monthly_rent: money(c.monthly_rent),
      unit_id: c.unit_id,
    })),
    exempt_months: exempt || [],
    calendar_2026: calendar ?? (calErr ? { error: calErr.message } : null),
    totals: {
      rent_charges: (charges || []).length,
      rent_revenue_txs: (allRentTxs || []).length,
      journal_links: (links || []).length,
      allocations: (allocs || []).length,
      months_with_issues: issues.length,
      months_installment_ok: months.filter((m) => m.verdict === 'INSTALLMENT_OK').length,
      sum_expected: money(months.reduce((s, m) => s + m.expected_rent, 0)),
      sum_active_collected: money(months.reduce((s, m) => s + m.active_linked, 0)),
      sum_all_rent_txs: money((allRentTxs || []).reduce((s, t) => s + Number(t.amount || 0), 0)),
      unlinked_rent_txs: unlinkedRentTxs.length,
    },
    months,
    issues,
    unlinked_rent_transactions: unlinkedRentTxs.map((t) => ({
      id: t.id,
      number: t.number,
      amount: money(t.amount),
      date: t.tx_date,
      method: t.method,
      status: t.status,
      description: t.description,
    })),
    all_rent_transactions: (allRentTxs || []).map((t) => ({
      id: t.id,
      number: t.number,
      amount: money(t.amount),
      date: t.tx_date,
      method: t.method,
      status: t.status,
      description: t.description,
      linked_to_month: linkedTxIdSet.has(t.id),
    })),
  };

  report.push(tenantReport);
}

const out = resolve(__dir, '../tmp-zakaria-rent-detail.json');
writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');

for (const r of report) {
  console.log('\n==========', r.tenant.name, '| محل', r.tenant.shop, '==========');
  console.log('عقود:', r.contracts.map((c) => `${c.status} rent=${c.monthly_rent}`).join(' | '));
  console.log('ملخص:', JSON.stringify(r.totals, null, 2));
  console.log('\n--- الأشهر ---');
  for (const m of r.months) {
    const flag =
      m.verdict === 'INSTALLMENT_OK'
        ? '[تقسيط سليم]'
        : m.verdict === 'PAID_OK'
          ? '[مسدد]'
          : m.verdict === 'PARTIAL_OR_UNPAID'
            ? '[ناقص]'
            : `[مشكلة:${m.verdict}]`;
    console.log(
      `${m.month} | متوقع ${m.expected_rent} | محصّل ${m.active_linked} | دفعات ${m.active_payment_count} | ${m.charge_statuses.join(',')} ${flag} ${m.note}`,
    );
    for (const p of m.payments) {
      console.log(
        `   · #${p.tx_number ?? '?'} ${p.tx_date} ${p.method || ''} ${p.amount} | قيد #${p.journal_number} ${p.journal_status} | ${p.description || ''}`,
      );
    }
    for (const p of m.reversed_links) {
      console.log(
        `   · ملغى: قيد #${p.journal_number} ${p.amount} (${p.journal_status})`,
      );
    }
  }
  if (r.issues.length) {
    console.log('\n!!! مشاكل:', r.issues.map((i) => `${i.month}:${i.verdict}`).join(', '));
  } else {
    console.log('\nلا زيادات ولا تسجيل مزدوج.');
  }
  if (r.unlinked_rent_transactions.length) {
    console.log('\nمعاملات إيجار غير مربوطة بشهر:');
    for (const t of r.unlinked_rent_transactions) {
      console.log(`   · #${t.number} ${t.date} ${t.amount} ${t.method} ${t.description || ''}`);
    }
  }
}
console.log('\nFull JSON:', out);
