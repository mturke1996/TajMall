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

const cases = [
  { name: 'تاج لاند', month: '2026-04', txNumber: 48 },
  { name: 'احلى ملاك', month: '2026-04', txNumber: 36 },
  { name: 'ترف', month: '2026-04', txNumber: 23 },
];

for (const c of cases) {
  const { data: tenants } = await sb.from('contacts').select('id, name, shop_number').ilike('name', `%${c.name}%`);
  const tenant = tenants?.[0];
  if (!tenant) {
    console.log('لا مستأجر', c.name);
    continue;
  }
  const { data: contracts } = await sb.from('lease_contracts').select('id, monthly_rent').eq('tenant_id', tenant.id);
  const cids = (contracts || []).map((x) => x.id);
  const { data: charges } = await sb
    .from('tenant_charges')
    .select('id, amount, total_paid, status, due_date')
    .in('contract_id', cids)
    .eq('type', 'RENT')
    .gte('due_date', `${c.month}-01`)
    .lte('due_date', `${c.month}-28`);

  const chargeIds = (charges || []).map((x) => x.id);
  const { data: links } = await sb
    .from('tenant_rent_journal_links')
    .select('amount, journal_entry_id')
    .in('charge_id', chargeIds.length ? chargeIds : ['00000000-0000-0000-0000-000000000000']);

  const jeIds = [...new Set((links || []).map((l) => l.journal_entry_id))];
  const { data: jes } = await sb
    .from('journal_entries')
    .select('id, number, status, source_id')
    .in('id', jeIds.length ? jeIds : ['00000000-0000-0000-0000-000000000000']);

  const txIds = (jes || []).filter((j) => j.status === 'POSTED').map((j) => j.source_id).filter(Boolean);
  const { data: linkedTxs } = await sb
    .from('transactions')
    .select('number, amount, tx_date, method, description, status')
    .in('id', txIds.length ? txIds : ['00000000-0000-0000-0000-000000000000']);

  const { data: unlinkedTx } = await sb
    .from('transactions')
    .select('id, number, amount, tx_date, method, description, status, created_at')
    .eq('number', c.txNumber)
    .eq('contact_id', tenant.id)
    .maybeSingle();

  const activeLinked = moneySum(
    (links || []).filter((l) => {
      const je = (jes || []).find((j) => j.id === l.journal_entry_id);
      return je?.status === 'POSTED';
    }),
  );

  console.log(`\n===== ${tenant.name} | محل ${tenant.shop_number} | ${c.month} =====`);
  console.log(
    'المطالبة:',
    (charges || []).map((ch) => `${ch.status} amount=${ch.amount} paid=${ch.total_paid}`).join(' | ') || 'لا مطالبة',
  );
  console.log('محصّل مربوط:', activeLinked);
  console.log(
    'دفعات مربوطة:',
    (linkedTxs || []).map((t) => `#${t.number} ${t.tx_date} ${t.method} ${t.amount} ${t.description}`).join('\n  ') ||
      'لا',
  );
  console.log(
    'المعاملة غير المربوطة:',
    unlinkedTx
      ? `#${unlinkedTx.number} ${unlinkedTx.tx_date} ${unlinkedTx.method} ${unlinkedTx.amount} ${unlinkedTx.description} created=${unlinkedTx.created_at}`
      : 'غير موجودة',
  );

  const expected = Number(charges?.[0]?.amount || contracts?.[0]?.monthly_rent || 0);
  if (unlinkedTx && activeLinked >= expected - 0.01) {
    console.log('→ الحكم: الشهر مسدد بالكامل عبر دفعات أخرى — غير المربوطة مكررة نقدياً على الأرجح');
  } else if (unlinkedTx && activeLinked + Number(unlinkedTx.amount) <= expected + 0.01) {
    console.log('→ الحكم: يبدو دفعة ناقصة تحتاج ربطاً بالشهر (ليست مكررة)');
  } else if (unlinkedTx) {
    console.log(
      '→ الحكم: إن رُبطت ستصبح زيادة',
      activeLinked + Number(unlinkedTx.amount) - expected,
    );
  }
}

function moneySum(rows) {
  return rows.reduce((s, r) => s + Number(r.amount || 0), 0);
}
