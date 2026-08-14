/**
 * مقارنة معاملات زكريا غير المربوطة مع المربوطة (احتمال تسجيل نقدي مزدوج)
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

const tenantId = '7414e90a-5327-4fb4-8bd6-fbdc41ee09d5';
const suspectIds = [
  // unlinked
  'need-lookup',
];

const { data: cats } = await sb.from('categories').select('id, code').like('code', 'REV-RNT%');
const catIds = (cats || []).map((c) => c.id);

const { data: txs, error } = await sb
  .from('transactions')
  .select('*')
  .eq('contact_id', tenantId)
  .eq('kind', 'REVENUE')
  .in('category_id', catIds)
  .order('tx_date')
  .order('created_at');
if (error) throw error;

const txIds = txs.map((t) => t.id);
const { data: journals } = await sb
  .from('journal_entries')
  .select('id, number, status, source_type, source_id, entry_date, description, reversed_at, created_at')
  .eq('source_type', 'TRANSACTION')
  .in('source_id', txIds);

const jeByTx = new Map();
for (const j of journals || []) {
  if (!jeByTx.has(j.source_id)) jeByTx.set(j.source_id, []);
  jeByTx.get(j.source_id).push(j);
}

const jeIds = (journals || []).map((j) => j.id);
const { data: links } = await sb
  .from('tenant_rent_journal_links')
  .select('id, charge_id, journal_entry_id, amount')
  .in('journal_entry_id', jeIds.length ? jeIds : ['00000000-0000-0000-0000-000000000000']);

const linkByJe = new Map();
for (const l of links || []) {
  if (!linkByJe.has(l.journal_entry_id)) linkByJe.set(l.journal_entry_id, []);
  linkByJe.get(l.journal_entry_id).push(l);
}

// cashbox names
const cashboxIds = [...new Set(txs.map((t) => t.cashbox_id).filter(Boolean))];
const { data: cashboxes } = await sb.from('cashboxes').select('id, name').in('id', cashboxIds);
const cbMap = new Map((cashboxes || []).map((c) => [c.id, c.name]));

console.log('عدد معاملات الإيجار:', txs.length);
console.log('\n# | تاريخ | مبلغ | طريقة | حالة | صندوق | وصف | قيد | روابط شهر');
for (const t of txs) {
  const jes = jeByTx.get(t.id) || [];
  const postedJe = jes.filter((j) => j.status === 'POSTED');
  const revJe = jes.filter((j) => j.status === 'REVERSED');
  const monthLinks = postedJe.flatMap((j) => linkByJe.get(j.id) || []);
  const linkedAmt = monthLinks.reduce((s, l) => s + Number(l.amount || 0), 0);
  console.log(
    [
      `#${t.number}`,
      t.tx_date,
      t.amount,
      t.method,
      t.status + (t.voided_at ? '/VOIDED' : ''),
      cbMap.get(t.cashbox_id) || t.cashbox_id?.slice(0, 8) || '-',
      (t.description || '').slice(0, 50),
      jes.map((j) => `#${j.number}:${j.status}`).join(',') || 'لا قيد',
      monthLinks.length ? `مرتبط=${linkedAmt}` : 'غير مربوط',
    ].join(' | '),
  );
}

// Pair duplicates by date+amount+method
console.log('\n=== احتمالات تكرار (نفس التاريخ+المبلغ+الطريقة) ===');
const groups = new Map();
for (const t of txs) {
  if (t.status === 'VOIDED' || t.voided_at) continue;
  const k = `${t.tx_date}|${Number(t.amount)}|${t.method}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(t);
}
for (const [k, rows] of groups) {
  if (rows.length < 2) continue;
  console.log(`\n${k} ×${rows.length}`);
  for (const t of rows) {
    const jes = jeByTx.get(t.id) || [];
    const monthLinks = jes
      .filter((j) => j.status === 'POSTED')
      .flatMap((j) => linkByJe.get(j.id) || []);
    console.log(
      `  #${t.number} created=${t.created_at} desc=${t.description} links=${monthLinks.length} je=${jes.map((j) => j.status).join(',')}`,
    );
  }
}

// #8 vs sum of may 31 payments
const may31 = txs.filter((t) => t.tx_date === '2026-05-31' && !t.voided_at && t.status !== 'VOIDED');
console.log('\n=== يوم 2026-05-31 ===');
let sum = 0;
for (const t of may31) {
  sum += Number(t.amount);
  console.log(`  #${t.number} ${t.amount} ${t.method} ${t.description}`);
}
console.log('مجموع يوم 31 مايو:', sum);

// Totals
const active = txs.filter((t) => t.status !== 'VOIDED' && !t.voided_at);
const activeSum = active.reduce((s, t) => s + Number(t.amount), 0);
const linkedActive = active.filter((t) => {
  const jes = (jeByTx.get(t.id) || []).filter((j) => j.status === 'POSTED');
  return jes.some((j) => (linkByJe.get(j.id) || []).length > 0);
});
const unlinkedActive = active.filter((t) => !linkedActive.includes(t));
console.log('\n=== ملخص نقدي ===');
console.log('معاملات نشطة:', active.length, 'مجموع', activeSum);
console.log(
  'مربوطة بشهر:',
  linkedActive.length,
  'مجموع',
  linkedActive.reduce((s, t) => s + Number(t.amount), 0),
);
console.log(
  'غير مربوطة:',
  unlinkedActive.length,
  'مجموع',
  unlinkedActive.reduce((s, t) => s + Number(t.amount), 0),
);
console.log(
  'غير مربوطة تفاصيل:',
  unlinkedActive.map((t) => `#${t.number}:${t.amount}:${t.description}`).join(' | '),
);
