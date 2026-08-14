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

async function detail(namePart, month) {
  const { data: tenants } = await sb
    .from('contacts')
    .select('id, name, shop_number')
    .ilike('name', `%${namePart}%`);
  const tenant = tenants[0];
  const { data: contracts } = await sb
    .from('lease_contracts')
    .select('id, monthly_rent')
    .eq('tenant_id', tenant.id);
  const { data: charges } = await sb
    .from('tenant_charges')
    .select('*')
    .in(
      'contract_id',
      contracts.map((c) => c.id),
    )
    .eq('type', 'RENT')
    .like('due_date', `${month}%`);

  console.log('\n####', tenant.name, month);
  console.log('charges', JSON.stringify(charges, null, 2));

  for (const ch of charges || []) {
    const { data: links } = await sb
      .from('tenant_rent_journal_links')
      .select('*')
      .eq('charge_id', ch.id);
    console.log('links', JSON.stringify(links, null, 2));
    const jeIds = (links || []).map((l) => l.journal_entry_id);
    if (ch.journal_entry_id) jeIds.push(ch.journal_entry_id);
    const { data: jes } = await sb
      .from('journal_entries')
      .select('id, number, status, source_type, source_id, description, amount:id')
      .in('id', [...new Set(jeIds)]);
    // fix select
  }

  const { data: cats } = await sb.from('categories').select('id').like('code', 'REV-RNT%');
  const { data: txs } = await sb
    .from('transactions')
    .select('id, number, amount, tx_date, method, description, status, created_at')
    .eq('contact_id', tenant.id)
    .eq('kind', 'REVENUE')
    .in(
      'category_id',
      cats.map((c) => c.id),
    )
    .or(`description.ilike.%أبريل%,description.ilike.%ابريل%,tx_date.gte.${month}-01,tx_date.lte.${month}-30`)
    .order('created_at');

  // simpler: all rent txs and filter april related
  const { data: allTxs } = await sb
    .from('transactions')
    .select('id, number, amount, tx_date, method, description, status, created_at')
    .eq('contact_id', tenant.id)
    .eq('kind', 'REVENUE')
    .in(
      'category_id',
      cats.map((c) => c.id),
    )
    .eq('status', 'POSTED')
    .order('tx_date');

  for (const t of allTxs || []) {
    const desc = t.description || '';
    if (!desc.includes('أبريل') && !desc.includes('ابريل') && !String(t.tx_date).startsWith(month))
      continue;
    const { data: jes } = await sb
      .from('journal_entries')
      .select('id, number, status')
      .eq('source_type', 'TRANSACTION')
      .eq('source_id', t.id);
    for (const je of jes || []) {
      const { data: links } = await sb
        .from('tenant_rent_journal_links')
        .select('amount, charge_id')
        .eq('journal_entry_id', je.id);
      console.log(
        `tx #${t.number} ${t.tx_date} ${t.method} ${t.amount} | je #${je.number} ${je.status} | links=${JSON.stringify(links)} | ${desc}`,
      );
    }
  }
}

await detail('تاج لاند', '2026-04');
await detail('ترف', '2026-04');
await detail('احلى ملاك', '2026-04');
