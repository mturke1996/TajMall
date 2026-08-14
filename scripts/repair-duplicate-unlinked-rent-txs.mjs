/**
 * اكتشاف وإصلاح معاملات إيجار مكررة نقدياً:
 * أصل غير مربوط بشهر + إعادة تسجيل مربوطة بنفس المستأجر/التاريخ/المبلغ.
 *
 * يُبقي التقسيط المربوط بالأشهر، ويعكس الأصل غير المربوط فقط.
 *
 * node scripts/repair-duplicate-unlinked-rent-txs.mjs --dry-run
 * node scripts/repair-duplicate-unlinked-rent-txs.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
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

function money(n) {
  return Math.round(Number(n || 0) * 1000) / 1000;
}

async function fetchAll(table, select, filters = (q) => q) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    let q = sb.from(table).select(select).range(from, from + pageSize - 1);
    q = filters(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
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

const { data: cats, error: catErr } = await sb
  .from('categories')
  .select('id, code')
  .like('code', 'REV-RNT%');
if (catErr) throw catErr;
const catIds = (cats || []).map((c) => c.id);
if (!catIds.length) {
  console.error('لا فئات REV-RNT');
  process.exit(1);
}

const txs = await fetchAll(
  'transactions',
  'id, number, contact_id, amount, tx_date, method, description, status, voided_at, cashbox_id, created_at, posted_at',
  (q) =>
    q
      .eq('kind', 'REVENUE')
      .in('category_id', catIds)
      .eq('status', 'POSTED')
      .is('voided_at', null)
      .order('tx_date'),
);

const contacts = await fetchIn(
  'contacts',
  'id, name, shop_number',
  [...new Set(txs.map((t) => t.contact_id).filter(Boolean))],
);
const contactMap = new Map(contacts.map((c) => [c.id, c]));

const txIds = txs.map((t) => t.id);
const journals = [];
for (let i = 0; i < txIds.length; i += 100) {
  const chunk = txIds.slice(i, i + 100);
  const { data, error } = await sb
    .from('journal_entries')
    .select('id, number, status, source_id, entry_date, reversed_at')
    .eq('source_type', 'TRANSACTION')
    .in('source_id', chunk);
  if (error) throw error;
  journals.push(...(data || []));
}

const postedJeByTx = new Map();
for (const j of journals) {
  if (j.status !== 'POSTED' || j.reversed_at) continue;
  if (!postedJeByTx.has(j.source_id)) postedJeByTx.set(j.source_id, []);
  postedJeByTx.get(j.source_id).push(j);
}

const jeIds = journals.filter((j) => j.status === 'POSTED').map((j) => j.id);
const allLinks = [];
for (let i = 0; i < jeIds.length; i += 100) {
  const chunk = jeIds.slice(i, i + 100);
  if (!chunk.length) continue;
  const { data, error } = await sb
    .from('tenant_rent_journal_links')
    .select('id, charge_id, journal_entry_id, amount')
    .in('journal_entry_id', chunk);
  if (error) throw error;
  allLinks.push(...(data || []));
}

const linkedJeIds = new Set(allLinks.map((l) => l.journal_entry_id));

function isLinked(txId) {
  const jes = postedJeByTx.get(txId) || [];
  return jes.some((j) => linkedJeIds.has(j.id));
}

function primaryJe(txId) {
  return (postedJeByTx.get(txId) || [])[0] || null;
}

const enriched = txs.map((t) => ({
  ...t,
  amount: money(t.amount),
  linked: isLinked(t.id),
  journal: primaryJe(t.id),
  tenant: contactMap.get(t.contact_id)?.name || '?',
  shop: contactMap.get(t.contact_id)?.shop_number || '',
}));

/** @type {Map<string, typeof enriched>} */
const byExact = new Map();
for (const t of enriched) {
  if (!t.contact_id) continue;
  const k = `${t.contact_id}|${t.tx_date}|${t.amount}|${t.method || ''}`;
  if (!byExact.has(k)) byExact.set(k, []);
  byExact.get(k).push(t);
}

/** @type {{ kind: string, reverse: any[], keep: any[], reason: string }[]} */
const actions = [];
const reverseIds = new Set();
const keepIds = new Set();

// 1) Exact duplicates: same contact+date+amount+method
for (const [, rows] of byExact) {
  if (rows.length < 2) continue;
  const linked = rows.filter((r) => r.linked);
  const unlinked = rows.filter((r) => !r.linked);
  if (!linked.length || !unlinked.length) continue;

  // Keep oldest linked if multiple; reverse all unlinked
  linked.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const keep = linked[0];
  for (const u of unlinked) {
    if (reverseIds.has(u.id)) continue;
    // Prefer reversing the earlier unlinked original when re-entry is later
    actions.push({
      kind: 'EXACT_PAIR',
      reason: `نفس التاريخ/المبلغ/الطريقة — أصل غير مربوط + إعادة مربوطة`,
      reverse: [u],
      keep: [keep],
    });
    reverseIds.add(u.id);
    keepIds.add(keep.id);
  }
}

// 2) Composite: unlinked amount = sum of linked txs same contact+date
//    that are not already "keep" of exact pairs against another unlinked of same amount
const byContactDate = new Map();
for (const t of enriched) {
  if (!t.contact_id) continue;
  const k = `${t.contact_id}|${t.tx_date}`;
  if (!byContactDate.has(k)) byContactDate.set(k, []);
  byContactDate.get(k).push(t);
}

for (const [, rows] of byContactDate) {
  const unlinked = rows.filter((r) => !r.linked && !reverseIds.has(r.id));
  const linked = rows.filter((r) => r.linked && !reverseIds.has(r.id));
  if (!unlinked.length || linked.length < 2) continue;

  for (const u of unlinked) {
    // Find subset of linked created after u that sums to u.amount
    const candidates = linked
      .filter((l) => String(l.created_at) > String(u.created_at))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

    // Try full set first, then pairs
    const trySets = [];
    if (candidates.length >= 2) trySets.push(candidates);
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        trySets.push([candidates[i], candidates[j]]);
      }
    }

    let matched = null;
    for (const set of trySets) {
      const sum = money(set.reduce((s, x) => s + x.amount, 0));
      if (Math.abs(sum - u.amount) <= 0.009) {
        // Avoid using a linked tx that is itself an exact-pair duplicate of another unlinked
        // (already handled). Also avoid if any in set already marked reverse.
        if (set.some((x) => reverseIds.has(x.id))) continue;
        matched = set;
        break;
      }
    }

    if (!matched) continue;

    actions.push({
      kind: 'COMPOSITE_COVER',
      reason: `مبلغ غير مربوط = مجموع إعادة تسجيل مربوطة بنفس اليوم`,
      reverse: [u],
      keep: matched,
    });
    reverseIds.add(u.id);
    for (const k of matched) keepIds.add(k.id);
  }
}

const report = {
  dry_run: dryRun,
  audited_at: new Date().toISOString(),
  totals: {
    rent_txs: enriched.length,
    actions: actions.length,
    txs_to_reverse: reverseIds.size,
    amount_to_reverse: money(
      [...reverseIds].reduce((s, id) => {
        const t = enriched.find((x) => x.id === id);
        return s + (t?.amount || 0);
      }, 0),
    ),
    tenants_affected: new Set(actions.flatMap((a) => a.reverse.map((r) => r.contact_id))).size,
  },
  actions: actions.map((a) => ({
    kind: a.kind,
    reason: a.reason,
    tenant: a.reverse[0]?.tenant,
    shop: a.reverse[0]?.shop,
    date: a.reverse[0]?.tx_date,
    reverse: a.reverse.map((t) => ({
      id: t.id,
      number: t.number,
      amount: t.amount,
      method: t.method,
      description: t.description,
      journal_id: t.journal?.id,
      journal_number: t.journal?.number,
      created_at: t.created_at,
    })),
    keep: a.keep.map((t) => ({
      id: t.id,
      number: t.number,
      amount: t.amount,
      method: t.method,
      description: t.description,
      linked: t.linked,
      created_at: t.created_at,
    })),
  })),
};

const outPath = resolve(__dir, '../tmp-duplicate-unlinked-rent-repair.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

console.log(dryRun ? '=== DRY RUN ===' : '=== APPLY ===');
console.log(JSON.stringify(report.totals, null, 2));
console.log('\n--- الإجراءات ---');
for (const a of report.actions) {
  console.log(
    `\n[${a.kind}] ${a.tenant} | محل ${a.shop || '-'} | ${a.date}\n  ${a.reason}`,
  );
  for (const r of a.reverse) {
    console.log(`  عكس: #${r.number} ${r.amount} ${r.method} | قيد #${r.journal_number} | ${r.description}`);
  }
  for (const k of a.keep) {
    console.log(`  إبقاء: #${k.number} ${k.amount} ${k.method} | ${k.description}`);
  }
}

if (!actions.length) {
  console.log('\nلا تكرارات من هذا النوع.');
  process.exit(0);
}

if (dryRun) {
  console.log(`\nالتقرير: ${outPath}`);
  console.log('أعد بدون --dry-run للتطبيق.');
  process.exit(0);
}

const results = [];
for (const a of actions) {
  for (const r of a.reverse) {
    if (!r.journal?.id && !primaryJe(r.id)?.id) {
      // need journal from enriched
    }
    const jeId = r.journal?.id || primaryJe(r.id)?.id;
    if (!jeId) {
      results.push({ tx: r.number, ok: false, error: 'لا قيد مرحّل' });
      continue;
    }
    const { data, error } = await sb.rpc('reverse_journal_entry', {
      p_journal_id: jeId,
    });
    if (error) {
      console.error(`فشل عكس #${r.number}:`, error.message);
      results.push({ tx: r.number, ok: false, error: error.message });
      process.exitCode = 1;
    } else {
      console.log(`✓ عُكس #${r.number} (قيد ${jeId}) → ${data}`);
      results.push({ tx: r.number, ok: true, journal: jeId, result: data });
    }
  }
}

writeFileSync(
  resolve(__dir, '../tmp-duplicate-unlinked-rent-repair-result.json'),
  JSON.stringify({ report, results }, null, 2),
  'utf8',
);

console.log('\nانتهى.');
