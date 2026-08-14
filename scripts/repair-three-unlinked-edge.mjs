/**
 * إصلاح 3 حالات متبقية:
 * - تاج لاند / ترف: قيد "الباقي" مربوط بكامل الإيجار بينما يوجد جزء غير مربوط
 * - احلى ملاك: دفعة أبريل غير مربوطة والشهر UNPAID
 *
 * node scripts/repair-three-unlinked-edge.mjs --dry-run
 * node scripts/repair-three-unlinked-edge.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const dryRun = process.argv.includes('--dry-run');
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

async function findTenant(namePart) {
  const { data, error } = await sb
    .from('contacts')
    .select('id, name, shop_number')
    .ilike('name', `%${namePart}%`)
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

async function findTx(tenantId, number) {
  const { data, error } = await sb
    .from('transactions')
    .select('id, number, amount, tx_date, method, description')
    .eq('contact_id', tenantId)
    .eq('number', number)
    .eq('status', 'POSTED')
    .single();
  if (error) throw error;
  return data;
}

async function findPostedJe(txId) {
  const { data, error } = await sb
    .from('journal_entries')
    .select('id, number, status')
    .eq('source_type', 'TRANSACTION')
    .eq('source_id', txId)
    .eq('status', 'POSTED')
    .single();
  if (error) throw error;
  return data;
}

async function findAprilCharge(tenantId) {
  const { data: contracts, error: cErr } = await sb
    .from('lease_contracts')
    .select('id')
    .eq('tenant_id', tenantId);
  if (cErr) throw cErr;
  const { data: charges, error } = await sb
    .from('tenant_charges')
    .select('id, amount, total_paid, status, due_date, contract_id')
    .in(
      'contract_id',
      contracts.map((c) => c.id),
    )
    .eq('type', 'RENT')
    .gte('due_date', '2026-04-01')
    .lte('due_date', '2026-04-30')
    .limit(1)
    .single();
  if (error) throw error;
  return charges;
}

async function getLinks(chargeId) {
  const { data, error } = await sb
    .from('tenant_rent_journal_links')
    .select('*')
    .eq('charge_id', chargeId);
  if (error) throw error;
  return data || [];
}

console.log(dryRun ? '=== DRY RUN ===' : '=== APPLY ===');

// 1) تاج لاند: shrink #49 link 23000→15000, add #48 link 8000
{
  const tenant = await findTenant('تاج لاند');
  const charge = await findAprilCharge(tenant.id);
  const txKeep = await findTx(tenant.id, 49);
  const txPart = await findTx(tenant.id, 48);
  const jeKeep = await findPostedJe(txKeep.id);
  const jePart = await findPostedJe(txPart.id);
  const links = await getLinks(charge.id);
  const keepLink = links.find((l) => l.journal_entry_id === jeKeep.id);

  console.log(`\n[تاج لاند] مطالبة ${charge.id} status=${charge.status} paid=${charge.total_paid}/${charge.amount}`);
  console.log(`  #49 رابط حالي=${keepLink?.amount} → 15000 | #48 يُربط 8000`);

  if (!dryRun) {
    if (!keepLink) throw new Error('تاج لاند: لا رابط لـ #49');
    const { error: uErr } = await sb
      .from('tenant_rent_journal_links')
      .update({ amount: 15000 })
      .eq('id', keepLink.id);
    if (uErr) throw uErr;

    const { error: iErr } = await sb.from('tenant_rent_journal_links').upsert(
      {
        charge_id: charge.id,
        journal_entry_id: jePart.id,
        amount: 8000,
      },
      { onConflict: 'charge_id,journal_entry_id' },
    );
    if (iErr) throw iErr;

    const { error: rErr } = await sb.rpc('recalc_tenant_charge_rent_paid', {
      p_charge_id: charge.id,
    });
    if (rErr) throw rErr;
    console.log('  ✓ تم');
  }
}

// 2) ترف: shrink #22 link 8000→4000, add #23 link 4000
{
  const tenant = await findTenant('ترف');
  const charge = await findAprilCharge(tenant.id);
  const txKeep = await findTx(tenant.id, 22);
  const txPart = await findTx(tenant.id, 23);
  const jeKeep = await findPostedJe(txKeep.id);
  const jePart = await findPostedJe(txPart.id);
  const links = await getLinks(charge.id);
  const keepLink = links.find((l) => l.journal_entry_id === jeKeep.id);

  console.log(`\n[ترف] مطالبة ${charge.id} status=${charge.status} paid=${charge.total_paid}/${charge.amount}`);
  console.log(`  #22 رابط حالي=${keepLink?.amount} → 4000 | #23 يُربط 4000`);

  if (!dryRun) {
    if (!keepLink) throw new Error('ترف: لا رابط لـ #22');
    const { error: uErr } = await sb
      .from('tenant_rent_journal_links')
      .update({ amount: 4000 })
      .eq('id', keepLink.id);
    if (uErr) throw uErr;

    const { error: iErr } = await sb.from('tenant_rent_journal_links').upsert(
      {
        charge_id: charge.id,
        journal_entry_id: jePart.id,
        amount: 4000,
      },
      { onConflict: 'charge_id,journal_entry_id' },
    );
    if (iErr) throw iErr;

    const { error: rErr } = await sb.rpc('recalc_tenant_charge_rent_paid', {
      p_charge_id: charge.id,
    });
    if (rErr) throw rErr;
    console.log('  ✓ تم');
  }
}

// 3) احلى ملاك: link #36 2000 to April
{
  const tenant = await findTenant('احلى ملاك');
  const charge = await findAprilCharge(tenant.id);
  const txPart = await findTx(tenant.id, 36);
  const jePart = await findPostedJe(txPart.id);

  console.log(`\n[احلى ملاك] مطالبة ${charge.id} status=${charge.status} paid=${charge.total_paid}/${charge.amount}`);
  console.log(`  #36 يُربط 2000`);

  if (!dryRun) {
    const { error: iErr } = await sb.from('tenant_rent_journal_links').upsert(
      {
        charge_id: charge.id,
        journal_entry_id: jePart.id,
        amount: 2000,
      },
      { onConflict: 'charge_id,journal_entry_id' },
    );
    if (iErr) throw iErr;

    const { error: rErr } = await sb.rpc('recalc_tenant_charge_rent_paid', {
      p_charge_id: charge.id,
    });
    if (rErr) throw rErr;
    console.log('  ✓ تم');
  }
}

if (dryRun) console.log('\nأعد بدون --dry-run للتطبيق.');
else console.log('\nانتهى إصلاح الحالات الثلاث.');
