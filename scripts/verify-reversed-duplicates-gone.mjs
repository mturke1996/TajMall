/**
 * التحقق أن المعاملات المكررة المعكوسة حُذفت وأن قيودها REVERSED
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
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

// From repair result
const reversed = [
  { txNumber: 56, journalId: 'c96976aa-dab0-4007-8b75-eb5359bbc612', label: 'زكريا #56' },
  { txNumber: 50, journalId: '44559e41-d4cb-4e74-87a9-6e003aca0951', label: 'موريسكو #50' },
  { txNumber: 42, journalId: 'baef07b7-c56e-46d2-97e6-8e960615c96b', label: 'زكريا #42' },
  { txNumber: 18, journalId: '3893591f-6a64-4fd1-aeff-fe3ba5cb6023', label: 'نرسيس #18' },
  { txNumber: 51, journalId: '3fa91e3b-2bb2-4175-a8cf-7dec7cdb254b', label: 'موريسكو #51' },
  { txNumber: 8, journalId: 'd22f80d0-a9fa-4dae-af9c-72d76186acbc', label: 'زكريا #8' },
];

const kept = [481, 482, 483, 484, 462, 463, 464, 485];

console.log('=== المعاملات المكررة (كان يجب حذفها) ===');
for (const r of reversed) {
  const { data: tx } = await sb
    .from('transactions')
    .select('id, number, status, amount')
    .eq('number', r.txNumber)
    .maybeSingle();

  const { data: je } = await sb
    .from('journal_entries')
    .select('id, number, status, reversed_at, source_id')
    .eq('id', r.journalId)
    .maybeSingle();

  const { data: links } = await sb
    .from('tenant_rent_journal_links')
    .select('id')
    .eq('journal_entry_id', r.journalId);

  console.log(
    `${r.label}: tx=${tx ? `EXISTS #${tx.number} ${tx.status}` : 'محذوفة ✓'} | قيد=${je ? `#${je.number} ${je.status}` : 'مفقود'} | روابط=${links?.length ?? 0}`,
  );
}

console.log('\n=== المعاملات المُبقاة (التقسيط) ===');
const { data: keptTxs } = await sb
  .from('transactions')
  .select('id, number, status, amount, description')
  .in('number', kept)
  .order('number');

for (const t of keptTxs || []) {
  const { data: jes } = await sb
    .from('journal_entries')
    .select('id, number, status')
    .eq('source_type', 'TRANSACTION')
    .eq('source_id', t.id)
    .eq('status', 'POSTED');
  const jeIds = (jes || []).map((j) => j.id);
  let linkCount = 0;
  if (jeIds.length) {
    const { data: links } = await sb
      .from('tenant_rent_journal_links')
      .select('id')
      .in('journal_entry_id', jeIds);
    linkCount = links?.length ?? 0;
  }
  console.log(
    `#${t.number} ${t.status} ${t.amount} | قيود مرحّلة=${jes?.length ?? 0} | روابط شهر=${linkCount} | ${t.description}`,
  );
}

// Unlinked active rent txs overall
const { data: cats } = await sb.from('categories').select('id').like('code', 'REV-RNT%');
const catIds = (cats || []).map((c) => c.id);
const { data: allTxs } = await sb
  .from('transactions')
  .select('id, number, contact_id, amount, description')
  .eq('kind', 'REVENUE')
  .in('category_id', catIds)
  .eq('status', 'POSTED')
  .is('voided_at', null);

const ids = (allTxs || []).map((t) => t.id);
const jesAll = [];
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100);
  const { data } = await sb
    .from('journal_entries')
    .select('id, source_id, status')
    .eq('source_type', 'TRANSACTION')
    .in('source_id', chunk)
    .eq('status', 'POSTED');
  jesAll.push(...(data || []));
}
const jeByTx = new Map();
for (const j of jesAll) {
  if (!jeByTx.has(j.source_id)) jeByTx.set(j.source_id, []);
  jeByTx.get(j.source_id).push(j);
}
const jeIds = jesAll.map((j) => j.id);
const linkedJe = new Set();
for (let i = 0; i < jeIds.length; i += 100) {
  const chunk = jeIds.slice(i, i + 100);
  const { data } = await sb
    .from('tenant_rent_journal_links')
    .select('journal_entry_id')
    .in('journal_entry_id', chunk);
  for (const l of data || []) linkedJe.add(l.journal_entry_id);
}

let unlinked = 0;
let noJournal = 0;
for (const t of allTxs || []) {
  const jes = jeByTx.get(t.id) || [];
  if (!jes.length) {
    noJournal++;
    continue;
  }
  if (!jes.some((j) => linkedJe.has(j.id))) unlinked++;
}

console.log('\n=== عام ===');
console.log(`معاملات إيجار نشطة: ${allTxs?.length ?? 0}`);
console.log(`بدون قيد مرحّل: ${noJournal}`);
console.log(`لها قيد لكن غير مربوطة بشهر: ${unlinked}`);
console.log(unlinked === 0 && noJournal === 0 ? '\n✓ كل معاملات الإيجار النشطة مربوطة بشهر' : '\n⚠ يوجد غير مربوط');
