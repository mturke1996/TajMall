/**
 * فحص Supabase البعيد: RPCs وجداول الإيجار
 * node scripts/audit-supabase-remote.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
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

const REQUIRED_RPC = [
  'set_tenant_rent_month_status',
  'record_rent_payment',
  'ensure_tenant_rent_charges',
  'ensure_tenant_lease_contract',
  'get_tenant_rent_calendar',
  'recalc_tenant_charge_rent_paid',
  'purge_rent_links_for_journal',
  'reverse_journal_entry',
  'dedupe_rent_charges_data',
];

const issues = [];
const ok = [];

async function checkTable(name) {
  const { error, count } = await sb.from(name).select('*', { count: 'exact', head: true });
  if (error) issues.push(`TABLE ${name}: ${error.message}`);
  else ok.push(`TABLE ${name} (${count ?? '?'} rows head ok)`);
}

async function checkRpc(name, args) {
  const { error } = await sb.rpc(name, args);
  if (!error) {
    ok.push(`RPC ${name}: callable`);
    return;
  }
  const msg = error.message ?? '';
  if (
    msg.includes('does not exist') ||
    msg.includes('Could not find') ||
    error.code === 'PGRST202'
  ) {
    issues.push(`RPC ${name}: MISSING — ${msg}`);
  } else if (
    msg.includes('صلاحية') ||
    msg.includes('permission') ||
    msg.includes('حدّد شهر') ||
    msg.includes('invalid input') ||
    msg.includes('null value') ||
    msg.includes('foreign key') ||
    msg.includes('not found') ||
    msg.includes('لا يوجد') ||
    msg.includes('لم يُنشأ قيد')
  ) {
    ok.push(`RPC ${name}: exists (${msg.slice(0, 72)}…)`);
  } else {
    issues.push(`RPC ${name}: ${error.code} — ${msg}`);
  }
}

async function main() {
  console.log('🔍 Supabase audit:', url);

  for (const t of [
    'tenant_charges',
    'tenant_rent_journal_links',
    'lease_contracts',
    'journal_entries',
  ]) {
    await checkTable(t);
  }

  const { data: viewData, error: viewErr } = await sb
    .from('tenant_rent_summary')
    .select('id, total_rent_paid, open_charges_total, current_month_status')
    .limit(3);
  if (viewErr) issues.push(`VIEW tenant_rent_summary: ${viewErr.message}`);
  else ok.push(`VIEW tenant_rent_summary (${viewData?.length ?? 0} sample rows)`);

  const year = new Date().getFullYear();
  const { data: rentCharges, error: chErr } = await sb
    .from('tenant_charges')
    .select('id, contract_id, amount, total_paid, due_date, status')
    .eq('type', 'RENT')
    .gte('due_date', `${year}-01-01`)
    .lte('due_date', `${year}-12-31`);
  if (chErr) issues.push(`RENT charges ${year}: ${chErr.message}`);
  else {
    ok.push(`RENT charges ${year}: ${rentCharges?.length ?? 0} rows`);
    const dup = new Map();
    for (const c of rentCharges ?? []) {
      const k = `${c.contract_id}|${String(c.due_date).slice(0, 7)}`;
      dup.set(k, (dup.get(k) ?? 0) + 1);
    }
    const dups = [...dup.entries()].filter(([, n]) => n > 1);
    if (dups.length > 0) {
      issues.push(
        `DATA: ${dups.length} عقد+شهر بمطالبات مكررة (أولها: ${dups[0][0]} ×${dups[0][1]})`,
      );
    } else ok.push('DATA: no duplicate contract+month RENT charges');
  }

  await checkRpc('set_tenant_rent_month_status', {
    p_tenant_id: '00000000-0000-0000-0000-000000000000',
    p_months: ['2026-01'],
    p_paid: false,
    p_journal_entry_id: null,
    p_amount: null,
  });
  await checkRpc('record_rent_payment', {
    tenant_id: '00000000-0000-0000-0000-000000000000',
    amount: 1,
    payment_date: '2026-01-01',
    cashbox_id: null,
    description: 'audit',
    rent_months: ['2026-01'],
    payment_method: 'CASH',
  });
  await checkRpc('recalc_tenant_charge_rent_paid', {
    p_charge_id: '00000000-0000-0000-0000-000000000000',
  });
  await checkRpc('ensure_tenant_rent_charges', {
    p_tenant_id: '00000000-0000-0000-0000-000000000000',
    p_months: ['2026-01'],
  });
  await checkRpc('ensure_tenant_lease_contract', {
    p_tenant_id: '00000000-0000-0000-0000-000000000000',
  });
  await checkRpc('get_tenant_rent_calendar', {
    p_tenant_id: '00000000-0000-0000-0000-000000000000',
    p_year: new Date().getFullYear(),
  });
  await checkRpc('purge_rent_links_for_journal', {
    p_journal_id: '00000000-0000-0000-0000-000000000000',
  });
  await checkRpc('reverse_journal_entry', {
    p_journal_id: '00000000-0000-0000-0000-000000000000',
  });
  await checkRpc('dedupe_rent_charges_data', {});

  const { data: linkRows } = await sb
    .from('tenant_rent_journal_links')
    .select('charge_id, amount, journal:journal_entries(status)')
    .limit(200);
  const paidByCharge = new Map();
  for (const row of linkRows ?? []) {
    const st = row.journal?.status;
    if (st === 'REVERSED') continue;
    if (st && st !== 'POSTED' && st !== 'DRAFT') continue;
    const id = row.charge_id;
    paidByCharge.set(id, (paidByCharge.get(id) ?? 0) + Number(row.amount || 0));
  }
  const { data: sampleCharges } = await sb
    .from('tenant_charges')
    .select('id, amount, total_paid, status')
    .eq('type', 'RENT')
    .limit(30);
  let mismatch = 0;
  for (const c of sampleCharges ?? []) {
    const fromLinks = paidByCharge.get(c.id) ?? 0;
    const tp = Number(c.total_paid) || 0;
    const amt = Number(c.amount) || 0;
    const expected = Math.min(fromLinks, amt);
    if (Math.abs(tp - expected) > 0.02 && (fromLinks > 0 || tp > 0)) {
      mismatch += 1;
    }
  }
  if (mismatch > 0) {
    issues.push(
      `DATA: ${mismatch} مطالبة total_paid لا يطابق مجموع الروابط (شغّل 036 أو أعد الربط)`,
    );
  } else {
    ok.push('DATA: total_paid متوافق مع روابط القيود (عينة)');
  }

  console.log('\n✅ OK:');
  ok.forEach((l) => console.log('  ', l));
  console.log('\n❌ Issues:');
  if (issues.length === 0) console.log('  (none)');
  else issues.forEach((l) => console.log('  ', l));

  process.exit(issues.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
