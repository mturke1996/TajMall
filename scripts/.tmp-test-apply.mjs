import { readFileSync } from 'node:fs';
import { createReplica } from './lib/pglite-replica.mjs';
const S = '/tmp/claude-0/-home-user-TajMall/61011cd7-adbd-5437-8b96-840938cdc77a/scratchpad/apply';
const { db } = await createReplica();
const owner = '1a5db0e9-f0ff-4877-aa18-eb60c5e72b7e', viewer = 'b5cf294e-a8c2-41f3-bc17-05242e10fe2b', cash = '44e1f9c4-f6b3-4ded-859b-243ec9c36d01';
const fx = [
  `ALTER TABLE public.profiles DISABLE TRIGGER USER`,
  `INSERT INTO auth.users (id, email) VALUES ('${owner}', 'o@x'), ('${viewer}', 'v@x') ON CONFLICT DO NOTHING`,
  `INSERT INTO public.profiles (id, role) VALUES ('${owner}', 'owner'), ('${viewer}', 'viewer') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`,
  `INSERT INTO public.cashboxes (id, code, name, name_ar, kind, currency, active) VALUES ('${cash}', 'CASHT', 'Cash', 'خزينة', 'CASH', 'LYD', true) ON CONFLICT DO NOTHING`,
  `ALTER TABLE public.profiles ENABLE TRIGGER USER`,
  // repo migrations lack the production report function; a stub keeps the read check meaningful elsewhere
  `CREATE OR REPLACE FUNCTION public.get_trial_balance(p_year int) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$`,
];
for (const s of fx) { try { await db.exec(s); } catch (e) { console.log('fixture:', e.message.slice(0, 160)); } }
const seq = async () => (await db.query(`SELECT (SELECT last_value FROM transactions_number_seq) t, (SELECT last_value FROM journal_entries_number_seq) j, (SELECT count(*) FROM transactions) tx, (SELECT count(*) FROM journal_entries) je`)).rows[0];
console.log('before', await seq());
console.log('open write policies on replica:', (await db.query(`SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND cmd <> 'SELECT' AND (lower(coalesce(qual, '')) IN ('true', '(true)') OR lower(coalesce(with_check, '')) IN ('true', '(true)')) AND tablename <> 'app_notifications'`)).rows.map(r => r.tablename + '.' + r.policyname + ':' + r.cmd).join(', '));
for (const k of ['078', '080', '081']) {
  const sql = readFileSync(`${S}/apply_${k}.sql`, 'utf8');
  try {
    await db.exec('BEGIN;\n' + sql + '\nCOMMIT;');
    console.log(k, 'APPLIED', await seq());
  } catch (e) {
    try { await db.exec('ROLLBACK'); } catch {}
    console.log(k, 'FAILED:', e.message.slice(0, 900));
  }
}
const st = (await db.query(`SELECT (SELECT count(*) FROM pg_class WHERE relname LIKE 'payroll_%' AND relkind = 'r') payroll_tables, (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_contacts_protect_history', 'trg_tx_category_matches_kind')) triggers, has_function_privilege('authenticated', 'public.reverse_ledger_entry(text,uuid,uuid)', 'EXECUTE') rev_callable`)).rows[0];
console.log('final state', st);
