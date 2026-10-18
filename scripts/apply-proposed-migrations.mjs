/**
 * Applies the reviewed migrations in docs/proposed-migrations to the database in .env.local:
 *   078 security + ledger fixes → 080 payroll → 081 rent safety
 *
 *   npm run db:snapshot                                        # 1. fresh backup first
 *   node scripts/apply-proposed-migrations.mjs --confirm       # 2. apply all pending, in order
 *   node scripts/apply-proposed-migrations.mjs --confirm --only 078
 *
 * Every file must match the SHA-256 of the version that passed the replica suites. Each one is
 * verified right after it is applied; if any check fails, the rollback files of everything applied
 * in this run are executed in reverse order. Files already applied are detected and skipped.
 * Data backfills (079) are separate on purpose: scripts/backfill-rent-accruals.mjs.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readLocalEnv } from './lib/pglite-replica.mjs';

const args = process.argv.slice(2);
if (!args.includes('--confirm')) {
  console.log('This writes to the live database. Run `npm run db:snapshot` first, then re-run with --confirm.');
  process.exit(1);
}
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const pg = createRequire(resolve(process.cwd(), 'package.json'))('pg');
const DIR = 'docs/proposed-migrations';

const MIGRATIONS = [
  {
    id: '078', up: '078_security_and_ledger_fixes.sql', down: '078_security_and_ledger_fixes.ROLLBACK.sql',
    sha: 'c22edbb9f5546aa387caa722d5fe0dd8ed8daad3d854c78ac2692539d3256ef7',
    applied: `SELECT to_regprocedure('public.post_missing_charge_accrual(uuid)') IS NOT NULL AS done`,
  },
  {
    id: '080', up: '080_payroll.sql', down: '080_payroll.ROLLBACK.sql',
    sha: '3ec45737173536a83d26640ffa9bcf84f624cff5e2855dfb732affa504b372e5',
    applied: `SELECT to_regclass('public.payroll_runs') IS NOT NULL AS done`,
  },
  {
    id: '081', up: '081_rent_safety.sql', down: '081_rent_safety.ROLLBACK.sql',
    sha: 'f37ae9ca536571acae33b7a728d9b15a4528cb3e2f47557e93c327ae4abfd5c5',
    applied: `SELECT to_regprocedure('public.rent_missing_charges(text)') IS NOT NULL AS done`,
  },
];

const env = readLocalEnv();
const connectionString = (env.DATABASE_URL || env.DIRECT_URL).replace('?pgbouncer=true', '');
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const one = async (sql, params) => (await client.query(sql, params)).rows[0];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
/** Runs one statement as an API role inside a read-only transaction (nothing can be written). */
const asRole = async (role, claims, sql, params) => {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await client.query(`SET LOCAL ROLE ${role}`);
    return { ok: true, rows: (await client.query(sql, params)).rows };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await client.query('ROLLBACK');
  }
};
const owner = (await one(`SELECT id FROM profiles WHERE role = 'owner' ORDER BY created_at LIMIT 1`))?.id;
const ownerClaims = { sub: owner, role: 'authenticated' };

const VERIFY = {
  '078': async () => {
    check('anon cannot execute any SECURITY DEFINER function', Number((await one(`SELECT count(*) n FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')`)).n) === 0);
    check('anon cannot read any table or view', Number((await one(`SELECT count(*) n FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v') AND has_table_privilege('anon', c.oid, 'SELECT')`)).n) === 0);
    check('no open write policies remain', Number((await one(`SELECT count(*) n FROM pg_policies WHERE schemaname = 'public'
      AND cmd <> 'SELECT' AND (lower(coalesce(qual, '')) IN ('true', '(true)') OR lower(coalesce(with_check, '')) IN ('true', '(true)'))
      AND tablename <> 'app_notifications'`)).n) === 0);
    const anon = await asRole('anon', { role: 'anon' }, `SELECT count(*) FROM tenants_rent_status`);
    check('anon blocked from tenant data', !anon.ok);
    const bs = await asRole('authenticated', ownerClaims, `SELECT get_balance_sheet(CURRENT_DATE)->'summary' s`);
    const s = bs.rows?.[0]?.s ?? {};
    check('balance sheet balances', bs.ok && Math.abs(Number(s.total_assets) - Number(s.total_liabilities) - Number(s.total_equity)) < 0.001, JSON.stringify(s));
  },
  '080': async () => {
    check('payroll tables exist', Number((await one(`SELECT count(*) n FROM pg_class WHERE relnamespace = 'public'::regnamespace
      AND relname IN ('payroll_salary_structures','payroll_adjustments','payroll_advances','payroll_runs','payroll_run_lines','payroll_advance_repayments','payroll_payments')`)).n) === 7);
    check('anon cannot touch payroll', !(await asRole('anon', { role: 'anon' }, `SELECT count(*) FROM payroll_runs`)).ok);
    check('owner reads payroll views', (await asRole('authenticated', ownerClaims, `SELECT count(*) FROM payroll_run_lines_status`)).ok);
    check('employee summary still readable', (await asRole('authenticated', ownerClaims, `SELECT count(*) FROM employee_summary`)).ok);
    check('runs are re-checked before approval and posting', Number((await one(`SELECT count(*) n FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname IN ('payroll_compute_run', 'payroll_run_differences', 'payroll_assert_run_current')`)).n) === 3);
  },
  '081': async () => {
    const preview = await asRole('authenticated', ownerClaims, `SELECT count(*) n, coalesce(sum(amount), 0) a FROM rent_missing_charges(to_char(CURRENT_DATE, 'YYYY-MM'))`);
    check('missing-charges preview runs for the owner', preview.ok, preview.ok ? `${preview.rows[0].n} months / ${preview.rows[0].a} LYD` : preview.error);
    check('contact history guard installed', Number((await one(`SELECT count(*) n FROM pg_trigger WHERE tgname = 'trg_contacts_protect_history'`)).n) === 1);
    const svc = await asRole('authenticated', { role: 'service_role' }, `SELECT public.auth_role_may_write() ok`);
    check('server jobs (service_role) pass write guards', svc.ok && svc.rows[0].ok === true);
  },
};

const OWNER_READS = [
  `SELECT count(*) FROM transactions`, `SELECT count(*) FROM tenant_rent_summary`, `SELECT count(*) FROM cashbox_balances`,
  `SELECT count(*) FROM journal_lines_with_categories`, `SELECT count(*) FROM monthly_summary`, `SELECT get_trial_balance(2026)`,
  `SELECT get_profit_loss(2026, 'year', NULL, NULL)`, `SELECT get_cash_flow(2026)`, `SELECT get_tenant_ar_aging(CURRENT_DATE)`,
  `SELECT get_treasury_balance_total()`, `SELECT get_tenant_rent_calendar((SELECT id FROM contacts WHERE kind = 'TENANT' LIMIT 1), 2026)`,
];

const appliedNow = [];
let failed = false;
try {
  for (const m of MIGRATIONS) {
    if (only && !only.includes(m.id)) continue;
    const sql = readFileSync(`${DIR}/${m.up}`);
    const sha = createHash('sha256').update(sql).digest('hex');
    if (sha !== m.sha) throw new Error(`${m.up} differs from the tested version (${sha}) — aborting before any change`);
    if ((await one(m.applied)).done) {
      console.log(`${m.id}: already applied — skipped`);
      continue;
    }
    console.log(`${m.id}: applying ${m.up} …`);
    await client.query(sql.toString('utf8')); // BEGIN … COMMIT inside the file: all or nothing
    appliedNow.push(m);
    const before = checks.length;
    await VERIFY[m.id]();
    if (checks.slice(before).some((c) => !c.ok)) { failed = true; break; }
  }
  if (!failed && appliedNow.length) {
    const failures = [];
    for (const sql of OWNER_READS) {
      const r = await asRole('authenticated', ownerClaims, sql);
      if (!r.ok) failures.push(`${sql.slice(0, 40)}: ${r.error}`);
    }
    check(`owner can read every screen source (${OWNER_READS.length})`, failures.length === 0, failures.join(' | '));
    failed = failures.length > 0;
  }
} catch (error) {
  // Any error is a failure, including one in the first file. A file that failed half-way leaves the
  // session inside its aborted BEGIN; end it first or every following statement (the rollbacks) fails.
  console.log(`error: ${error.message}`);
  try { await client.query('ROLLBACK'); } catch {}
  failed = true;
}

if (failed) {
  if (appliedNow.length) console.log('\nA check failed — rolling back what this run applied, newest first.');
  const notRolledBack = [];
  for (const m of [...appliedNow].reverse()) {
    try {
      await client.query(readFileSync(`${DIR}/${m.down}`, 'utf8'));
      console.log(`  rolled back ${m.id}`);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      notRolledBack.push(m.id);
      console.log(`  ROLLBACK OF ${m.id} FAILED: ${error.message}`);
    }
  }
  if (notRolledBack.length) {
    console.log(`\n${notRolledBack.join(', ')} could not be rolled back automatically and is still applied.`);
    console.log('Restore from the snapshot taken before this run (npm run backup:restore-cold) or run the ROLLBACK file by hand.');
  }
  console.log('\nFAILED — see the messages above.');
  process.exitCode = 1;
} else {
  console.log(appliedNow.length ? `\nApplied ${appliedNow.map((m) => m.id).join(', ')}; all ${checks.length} checks passed.` : '\nNothing to apply.');
}
await client.end();
