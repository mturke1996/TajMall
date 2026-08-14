/**
 * إصلاح روابط إيجار مرتبطة بقيود ملغاة فقط.
 * لا يمس حالات التقسيط الصحيحة (مجموع المدفوع = الإيجار).
 *
 * node scripts/repair-orphan-reversed-rent-links.mjs
 * node scripts/repair-orphan-reversed-rent-links.mjs --dry-run
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
    if (!chunk.length) continue;
    const { data, error } = await sb.from(table).select(select).in('id', chunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

const links = await fetchAll(
  'tenant_rent_journal_links',
  'id, charge_id, journal_entry_id, amount',
);
const jeIds = [...new Set(links.map((l) => l.journal_entry_id))];
const journals = await fetchIn(
  'journal_entries',
  'id, number, status, reversed_at, description',
  jeIds,
);
const jeMap = new Map(journals.map((j) => [j.id, j]));

const reversedJournalIds = new Set();
for (const l of links) {
  const je = jeMap.get(l.journal_entry_id);
  if (!je) continue;
  if (je.status === 'REVERSED' || je.status === 'VOID' || je.reversed_at) {
    reversedJournalIds.add(je.id);
  }
}

const targets = [...reversedJournalIds].map((id) => {
  const je = jeMap.get(id);
  const related = links.filter((l) => l.journal_entry_id === id);
  return {
    journal_id: id,
    journal_number: je?.number,
    status: je?.status,
    description: je?.description,
    links: related.map((l) => ({
      id: l.id,
      charge_id: l.charge_id,
      amount: Number(l.amount),
    })),
    amount_sum: related.reduce((s, l) => s + Number(l.amount || 0), 0),
  };
});

console.log(dryRun ? '=== DRY RUN ===' : '=== APPLY REPAIR ===');
console.log(`قيود ملغاة ما زال لها روابط: ${targets.length}`);
for (const t of targets) {
  console.log(
    `قيد #${t.journal_number} (${t.status}) · روابط ${t.links.length} · مبلغ ${t.amount_sum} · ${t.description || ''}`,
  );
}

if (!targets.length) {
  console.log('لا يوجد شيء لإصلاحه.');
  process.exit(0);
}

if (dryRun) {
  console.log('\nأعد التشغيل بدون --dry-run لتطبيق الإصلاح.');
  process.exit(0);
}

const chargeIdsToVerify = new Set();
for (const t of targets) {
  const { error } = await sb.rpc('purge_rent_links_for_journal', {
    p_journal_id: t.journal_id,
  });
  if (error) {
    console.error(`فشل purge لقيد #${t.journal_number}:`, error.message);
    process.exit(1);
  }
  console.log(`✓ نُظّف قيد #${t.journal_number}`);
  for (const l of t.links) chargeIdsToVerify.add(l.charge_id);
}

// Verify remaining links for affected charges
for (const chargeId of chargeIdsToVerify) {
  const { data: charge, error: cErr } = await sb
    .from('tenant_charges')
    .select('id, amount, total_paid, status, due_date')
    .eq('id', chargeId)
    .single();
  if (cErr) throw cErr;

  const { data: remainLinks, error: lErr } = await sb
    .from('tenant_rent_journal_links')
    .select('id, journal_entry_id, amount')
    .eq('charge_id', chargeId);
  if (lErr) throw lErr;

  const jeRemainIds = [...new Set((remainLinks || []).map((l) => l.journal_entry_id))];
  const remainJournals = jeRemainIds.length
    ? await fetchIn('journal_entries', 'id, number, status', jeRemainIds)
    : [];
  const remainJeMap = new Map(remainJournals.map((j) => [j.id, j]));

  const activeSum = (remainLinks || [])
    .filter((l) => {
      const je = remainJeMap.get(l.journal_entry_id);
      return je && je.status !== 'REVERSED' && je.status !== 'VOID';
    })
    .reduce((s, l) => s + Number(l.amount || 0), 0);

  console.log(
    `مطالبة ${String(charge.due_date).slice(0, 7)}: amount=${charge.amount} total_paid=${charge.total_paid} status=${charge.status} active_links=${activeSum} links_left=${remainLinks?.length ?? 0}`,
  );
}

console.log('\nتم. التقسيط الصحيح لم يُمس.');
