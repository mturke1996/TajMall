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

const { data: cats } = await sb.from('categories').select('id').like('code', 'REV-RNT%');
const catIds = (cats || []).map((c) => c.id);
const { data: allTxs } = await sb
  .from('transactions')
  .select('id, number, contact_id, amount, tx_date, method, description, created_at')
  .eq('kind', 'REVENUE')
  .in('category_id', catIds)
  .eq('status', 'POSTED')
  .is('voided_at', null)
  .order('tx_date');

const ids = (allTxs || []).map((t) => t.id);
const jesAll = [];
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100);
  const { data } = await sb
    .from('journal_entries')
    .select('id, number, source_id, status')
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

const contactIds = [...new Set((allTxs || []).map((t) => t.contact_id).filter(Boolean))];
const contacts = [];
for (let i = 0; i < contactIds.length; i += 100) {
  const chunk = contactIds.slice(i, i + 100);
  const { data } = await sb.from('contacts').select('id, name, shop_number').in('id', chunk);
  contacts.push(...(data || []));
}
const cmap = new Map(contacts.map((c) => [c.id, c]));

console.log('معاملات إيجار نشطة غير مربوطة بشهر:\n');
for (const t of allTxs || []) {
  const jes = jeByTx.get(t.id) || [];
  if (!jes.length) {
    const c = cmap.get(t.contact_id);
    console.log(`#${t.number} NO_JOURNAL | ${c?.name} | ${t.tx_date} | ${t.amount} | ${t.description}`);
    continue;
  }
  if (!jes.some((j) => linkedJe.has(j.id))) {
    const c = cmap.get(t.contact_id);
    console.log(
      `#${t.number} | ${c?.name || '?'} | محل ${c?.shop_number || '-'} | ${t.tx_date} | ${t.method} | ${t.amount} | قيد #${jes[0].number} | ${t.description}`,
    );
  }
}
