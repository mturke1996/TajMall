/**
 * Applies docs/proposed-migrations/078 to the database in .env.local, then verifies it.
 * If any post-apply check fails, the exact rollback file is applied automatically.
 *
 *   1. node scripts/backup-database-snapshot.mjs      (take a fresh snapshot first)
 *   2. node scripts/apply-078-with-verification.mjs --confirm
 *
 * Refuses to run when the 078 file differs from the version that passed the replica suite.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readLocalEnv } from './lib/pglite-replica.mjs';

if (!process.argv.includes('--confirm')) {
  console.log('This writes to the live database. Take a snapshot first, then re-run with --confirm.');
  process.exit(1);
}
const pg = createRequire(resolve(process.cwd(), 'package.json'))('pg');
const env = readLocalEnv();
const UP = 'docs/proposed-migrations/078_security_and_ledger_fixes.sql';
const DOWN = 'docs/proposed-migrations/078_security_and_ledger_fixes.ROLLBACK.sql';
const EXPECTED_SHA = '14d1c79473a635ca84ed0c08421edb65bfeea0540ef9134586d91fa2a26a2b71';
const upSql = readFileSync(UP, 'utf8');
const sha = createHash('sha256').update(readFileSync(UP)).digest('hex');
if (sha !== EXPECTED_SHA) throw new Error(`078 changed since it was tested (${sha}) — aborting`);

const connect = async () => {
  const c = new pg.Client({ connectionString: env.DATABASE_URL.replace('?pgbouncer=true', ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
};

const c = await connect();
console.log('applying 078 …');
await c.query(upSql); // BEGIN … COMMIT inside the file: all or nothing
console.log('applied.');

const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const one = async (sql, p) => (await c.query(sql, p)).rows[0];

// Structural checks
check('anon cannot execute any SECURITY DEFINER function',
  Number((await one(`SELECT count(*) n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')`)).n) === 0);
check('anon cannot read any view or table',
  Number((await one(`SELECT count(*) n FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v') AND has_table_privilege('anon', c.oid, 'SELECT')`)).n) === 0);
check('no open write policies remain (except notification read-marking)',
  Number((await one(`SELECT count(*) n FROM pg_policies WHERE schemaname='public' AND cmd <> 'SELECT' AND (lower(coalesce(qual,'')) IN ('true','(true)') OR lower(coalesce(with_check,'')) IN ('true','(true)')) AND tablename <> 'app_notifications'`)).n) === 0);
check('authenticated can still execute client RPCs',
  (await one(`SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) ok FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname = ANY($1)`,
    [['record_rent_payment', 'set_tenant_rent_month_status', 'create_journal_entry', 'get_balance_sheet', 'get_profit_loss', 'submit_voucher_for_approval', 'decide_voucher_approval', 'record_cashbox_transfer', 'ensure_tenant_rent_charges', 'create_contact', 'get_tenant_rent_calendar']])).ok);
check('internal functions closed to authenticated',
  !(await one(`SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) x FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname = ANY($1)`,
    [['purge_rent_links_for_journal', 'write_audit_log', 'dedupe_rent_charges_data', 'recalc_tenant_charge_rent_paid', 'post_missing_charge_accrual']])).x);
check('new helpers and trigger exist',
  Number((await one(`SELECT (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('post_missing_charge_accrual','charge_accrual_entry_date','check_transaction_category_kind')) + (SELECT count(*) FROM pg_trigger WHERE tgname='trg_tx_category_matches_kind') n`)).n) === 4);
check('voucher submit/approve fixed',
  !(await one(`SELECT bool_or(prosrc LIKE '%p_voucher_id::text' || chr(10) || '  );%') x FROM pg_proc WHERE proname IN ('submit_voucher_for_approval','decide_voucher_approval')`)).x);

// Behavioural checks, simulated as API roles inside read-only transactions.
const asRole = async (role, claims, sql, params) => {
  await c.query('BEGIN READ ONLY');
  try {
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`SET LOCAL ROLE ${role}`);
    return { ok: true, rows: (await c.query(sql, params)).rows };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    await c.query('ROLLBACK');
  }
};
for (const [label, sql] of [['tenants_rent_status', 'SELECT count(*) FROM tenants_rent_status'], ['get_trial_balance', 'SELECT get_trial_balance(2026)'], ['set_tenant_rent_exempt_months', `SELECT set_tenant_rent_exempt_months('00000000-0000-0000-0000-000000000000'::uuid, ARRAY['2026-01'], true)`]]) {
  const r = await asRole('anon', { role: 'anon' }, sql);
  check(`anon blocked: ${label}`, !r.ok, r.ok ? 'still allowed' : r.error.slice(0, 50));
}
const owner = await one(`SELECT id FROM profiles WHERE role = 'owner' ORDER BY created_at LIMIT 1`);
const ownerClaims = { sub: owner.id, role: 'authenticated' };
const ownerReads = [
  `SELECT count(*) FROM transactions`, `SELECT count(*) FROM tenant_rent_summary`, `SELECT count(*) FROM tenants_rent_status`,
  `SELECT count(*) FROM cashbox_balances`, `SELECT count(*) FROM journal_lines_with_categories`, `SELECT count(*) FROM monthly_summary`,
  `SELECT get_trial_balance(2026)`, `SELECT get_profit_loss(2026,'year',NULL,NULL)`, `SELECT get_balance_sheet(CURRENT_DATE)`,
  `SELECT get_cash_flow(2026)`, `SELECT get_tenant_ar_aging(CURRENT_DATE)`, `SELECT get_treasury_balance_total()`,
  `SELECT count(*) FROM tenant_rent_summary_for_month(to_char(CURRENT_DATE,'YYYY-MM'))`,
  `SELECT get_tenant_rent_calendar((SELECT id FROM contacts WHERE kind='TENANT' LIMIT 1), 2026)`,
];
const failures = [];
for (const sql of ownerReads) { const r = await asRole('authenticated', ownerClaims, sql); if (!r.ok) failures.push(`${sql.slice(0, 50)}: ${r.error}`); }
check(`owner reads every screen source (${ownerReads.length})`, failures.length === 0, failures.join(' | '));
const bs = await asRole('authenticated', ownerClaims, `SELECT get_balance_sheet(CURRENT_DATE)->'summary' s`);
const s = bs.rows?.[0]?.s ?? {};
check('balance sheet balances', Math.abs(Number(s.total_assets) - Number(s.total_liabilities) - Number(s.total_equity)) < 0.001, JSON.stringify(s));

await c.end();
const failed = checks.filter((x) => !x.ok);
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed — rolling back 078 now.`);
  const r = await connect();
  await r.query(readFileSync(DOWN, 'utf8'));
  await r.end();
  console.log('rollback applied.');
  process.exitCode = 1;
} else {
  console.log(`\nall ${checks.length} post-apply checks passed`);
}
