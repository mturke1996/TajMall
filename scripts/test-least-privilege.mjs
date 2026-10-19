/**
 * Least privilege (086) on an isolated PGlite replica — never touches production data.
 *
 *   node scripts/test-least-privilege.mjs                # runs the suite twice: 086 alone, then 085 + 086
 *   node scripts/test-least-privilege.mjs --no-children  # skip the accounting and payroll suites (fast)
 *   node scripts/test-least-privilege.mjs --live-dump <functions.sql>
 *       # overlay the live function bodies and EXECUTE grants from a read-only dump (the audit's functions.sql, also
 *       # accepted through LIVE_FUNCTIONS_DUMP), so the baseline is production's own text, not the repository's
 *
 * Baseline = repository migrations + proposed 078, 080, 081, 082, 083, 084 (what production has or will have),
 * with 085 in the second pass. The run:
 *   1. seeds users (owner, admin, accountant, cashier, viewer and a stranger who "signed up" through the auth
 *      service), contacts, a tenant lease, payroll, journals, a closed period, drafts and notifications;
 *   2. reproduces each defect on the baseline (printed as INFO, never counted);
 *   3. applies 086 twice and checks that nothing changed on the second run;
 *   4. checks every fix, and that every direct write the app really does (src/ .from(...).insert/update/delete)
 *      still works for the role that does it, and that what each approved role can read is unchanged;
 *   5. tests the optional blocks written as `--|` comments at the bottom of 086, with their UNDO blocks;
 *   6. rolls 086 back and compares the whole catalogue (relations, columns, grants, policies, triggers,
 *      functions, publication, default privileges) with the baseline, then applies it once more;
 *   7. replays the accounting scenarios and the payroll scenarios with 086 applied and requires that they fail
 *      on nothing they did not already fail on without it.
 * Exit code is 1 when any check fails.
 */
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReplica, actAs } from './lib/pglite-replica.mjs';

const args = process.argv.slice(2);
const NO_CHILDREN = args.includes('--no-children');
const DUMP = args.includes('--live-dump') ? args[args.indexOf('--live-dump') + 1] : process.env.LIVE_FUNCTIONS_DUMP;
const DIR = 'docs/proposed-migrations';
const read = (f) => readFileSync(`${DIR}/${f}`, 'utf8');
const BASE = ['078_security_and_ledger_fixes.sql', '080_payroll.sql', '081_rent_safety.sql', '082_role_and_voucher_guards.sql'];
const BASE_AFTER_DUMP = ['083_employee_leave.sql', '084_rent_summary_respects_claim_start.sql'];
const HAS_085 = existsSync(`${DIR}/085_function_hardening.sql`);

const results = [];
let pass = '';
const check = (area, name, ok, detail = '') => results.push({ pass, area, name, ok: Boolean(ok), detail: String(detail ?? '') });
const info = (area, name, detail = '') => results.push({ pass, area, name, ok: null, detail: String(detail ?? '') });
const n = (x) => Number(x ?? 0);
const near = (a, b) => Math.abs(n(a) - n(b)) < 0.001;

/** The optional blocks at the bottom of 086: lines starting with `--| ` between OPTIONAL-BEGIN/UNDO/END markers. */
function optionalBlocks(sql) {
  const out = {};
  const re = /^-- OPTIONAL-BEGIN (\S+)\n([\s\S]*?)^-- OPTIONAL-END \1$/gm;
  for (const m of sql.matchAll(re)) {
    const body = m[2];
    const [apply, undo = ''] = body.split(new RegExp(`^-- OPTIONAL-UNDO ${m[1]}$`, 'm'));
    const code = (t) => t.split('\n').filter((l) => l.startsWith('--| ')).map((l) => l.slice(4)).join('\n');
    out[m[1]] = { apply: code(apply), undo: code(undo) };
  }
  return out;
}

async function suite(label, { with085 }) {
  pass = label;
  const { db } = await createReplica();
  const rows = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await rows(sql, p))[0];
  const val = async (sql, p) => { const r = await one(sql, p); return r ? Object.values(r)[0] : undefined; };
  const attempt = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e.message, code: e.code }; } };
  const run = async (name, sql) => {
    try { await db.exec(sql); return true; } catch (e) {
      try { await db.exec('ROLLBACK'); } catch {}
      check('setup', name, false, e.message);
      return false;
    }
  };
  /** A statement from an API role that must not change anything: an error, or zero affected rows. */
  const blocked = async (sql, p) => {
    const r = await attempt(() => db.query(sql, p));
    return !r.ok || (r.value.affectedRows ?? 0) === 0;
  };
  const changed = async (sql, p) => {
    const r = await attempt(() => db.query(sql, p));
    return r.ok && (r.value.affectedRows ?? 0) > 0;
  };
  const errorOf = async (sql, p) => (await attempt(() => db.query(sql, p))).error ?? '';

  // ── baseline ──────────────────────────────────────────────────────────────
  let setupOk = true;
  for (const f of BASE) setupOk = (await run(`apply ${f}`, read(f))) && setupOk;
  if (DUMP) {
    const chunks = readFileSync(resolve(DUMP), 'utf8').split(/^-- ===== /m).slice(1);
    const sigs = [];
    let failedChunks = 0;
    for (const ch of chunks) {
      const lines = ch.split('\n');
      const sig = lines[0].split(' | ')[0];
      const acl = lines[1].replace(/^-- acl=/, '');
      try { await db.exec(lines.slice(2).join('\n').trim()); sigs.push({ sig, acl }); } catch { failedChunks += 1; }
    }
    for (const { sig, acl } of sigs) {
      await db.exec(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated, service_role`);
      for (const item of acl.replace(/[{}]/g, '').split(',').filter(Boolean)) {
        const grantee = item.split('=')[0];
        if (grantee !== 'postgres') await db.exec(`GRANT EXECUTE ON FUNCTION public.${sig} TO ${grantee === '' ? 'PUBLIC' : grantee}`);
      }
    }
    check('setup', `live function bodies and grants overlaid (${sigs.length} of ${chunks.length})`, failedChunks === 0 && sigs.length === chunks.length, `${failedChunks} failed`);
  }
  for (const f of BASE_AFTER_DUMP) setupOk = (await run(`apply ${f}`, read(f))) && setupOk;
  if (with085) setupOk = (await run('apply 085_function_hardening.sql', read('085_function_hardening.sql'))) && setupOk;
  if (!setupOk) { await db.close(); return; }

  const U = {
    owner: '11111111-1111-4111-8111-111111111111', admin: '55555555-5555-4555-8555-555555555555',
    accountant: '44444444-4444-4444-8444-444444444444', cashier: '33333333-3333-4333-8333-333333333333',
    viewer: '22222222-2222-4222-8222-222222222222',
    stranger0: '66666666-6666-4666-8666-666666666666', stranger1: '77777777-7777-4777-8777-777777777777',
    stranger2: '88888888-8888-4888-8888-888888888888', invitee: '99999999-9999-4999-8999-999999999999',
  };
  const su = () => actAs(db, 'superuser');
  const as = (who) => actAs(db, 'authenticated', U[who]);
  const asService = async () => {
    await actAs(db, 'superuser');
    await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
    await db.exec('SET ROLE service_role');
  };
  /** The auth service creates the user (no JWT at all); the trigger creates the profile. */
  const signUp = async (who) => {
    await su();
    await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{"full_name":"x"}'::jsonb)`, [U[who], `${who}@evil.test`]);
  };
  const inTx = async (fn) => {
    await su();
    await db.exec('BEGIN');
    try { return await fn(); } finally { try { await db.exec('ROLLBACK'); } catch {} await su(); }
  };

  await su();
  for (const w of ['owner', 'admin', 'accountant', 'cashier', 'viewer']) {
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [U[w], `${w}@test.local`]);
  }
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  for (const w of ['owner', 'admin', 'accountant', 'cashier', 'viewer']) {
    await db.query(`INSERT INTO profiles (id, role) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [U[w], w]);
  }
  await signUp('stranger0');

  // ── fixtures (written the way the app writes them) ────────────────────────
  await su();
  const cat = Object.fromEntries((await rows(`SELECT code, id FROM categories`)).map((r) => [r.code, r.id]));
  const CASH = await val(`SELECT id FROM cashboxes WHERE kind = 'CASH' AND active ORDER BY code LIMIT 1`);
  await as('owner');
  const BANK = await val(`INSERT INTO cashboxes (code, name, name_ar, kind, bank_name, account_number, iban, opening_balance)
    VALUES ('T-BANK', 'Test bank', 'مصرف اختبار', 'BANK', 'Jumhouria', '123456789', 'LY83002048000020100120361', 5000) RETURNING id`);
  const mk = async (payload) => { const r = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify(payload)]); return r?.id ?? r; };
  const TEN = await mk({ kind: 'TENANT', name: 'مستأجر اختبار', id_number: '119800112233', phone: '0912345678', monthly_rent: 1500, shop_number: 'T-1' });
  const EMP = await mk({ kind: 'EMPLOYEE', name: 'موظف اختبار', id_number: '119900445566', salary: 3200, job_title: 'محاسب', hire_date: '2025-01-01' });
  const VEN = await mk({ kind: 'VENDOR', name: 'مورد اختبار' });
  const EMP2 = await mk({ kind: 'EMPLOYEE', name: 'موظف بلا سجل', hire_date: '2025-01-01' });
  const month = await val(`SELECT to_char(CURRENT_DATE, 'YYYY-MM')`);
  await val(`SELECT ensure_tenant_lease_contract($1)`, [TEN]);
  await val(`SELECT ensure_tenant_rent_charges($1, ARRAY[$2]::text[])`, [TEN, month]);
  // a posted journal in the past, then closed; a draft; and the owner's and cashier's drafts
  await as('accountant');
  const JL = [{ category_id: cat['REV-GEN'], debit: 0, credit: 500, description: 'a' }, { category_id: cat['EXP-MNT'], debit: 500, credit: 0, description: 'b' }];
  const mkJournal = async (ref, date) => { const r = await val(`SELECT create_journal_entry($1, $2, 'manual', NULL, $3::jsonb)`, [ref, date, JSON.stringify(JL)]); return r?.id ?? r; };
  const JPOST = await mkJournal('LP-1', '2026-01-15');
  await val(`SELECT post_journal_entry($1::text)`, [JPOST]);
  const JDRAFT = await mkJournal('LP-2', '2026-02-15');
  const JDRAFT2 = await mkJournal('LP-3', '2026-02-16');
  await su();
  await db.query(`UPDATE fiscal_periods SET is_closed = true, closed_at = now() WHERE '2026-01-15' BETWEEN start_date AND end_date`);
  await as('owner');
  const draftTx = (who) => db.query(`INSERT INTO transaction_form_drafts (user_id, kind, label, payload) VALUES ($1, 'REVENUE', $2, '{"secret":"x"}'::jsonb)`, [U[who], `draft-${who}`]);
  await draftTx('owner');
  await db.query(`INSERT INTO journal_form_drafts (user_id, label, payload) VALUES ($1, 'jd-owner', '{}'::jsonb)`, [U.owner]);
  await as('cashier');
  await draftTx('cashier');
  await db.query(`INSERT INTO journal_form_drafts (user_id, label, payload) VALUES ($1, 'jd-cashier', '{}'::jsonb)`, [U.cashier]);
  await su();
  await db.query(`INSERT INTO app_notifications (kind, title_ar, body_ar, href) VALUES ('SYSTEM', 'تنبيه حقيقي', 'نص', '/dashboard')`);
  // payroll: an employee on a structure, one approved + posted run
  await as('accountant');
  await val(`SELECT payroll_set_salary($1, '2026-01-01', 2000, 300, 0, 0, 'تعيين')`, [EMP]);
  const prep = await val(`SELECT payroll_prepare_run('2026-03')`);
  await as('owner');
  await val(`SELECT payroll_approve_run($1)`, [prep.run_id]);
  await as('accountant');
  await val(`SELECT payroll_post_run($1)`, [prep.run_id]);
  // the cashier collects rent: an invoker trigger writes the allocation and the charge as the cashier
  await as('cashier');
  await db.query(`INSERT INTO transactions (kind, status, method, amount, tx_date, description, category_id, cashbox_id, contact_id)
    VALUES ('REVENUE', 'POSTED', 'CASH', 500, CURRENT_DATE, 'تحصيل إيجار', $1, $2, $3)`, [cat['REV-RNT'], CASH, TEN]);
  const TX = await val(`SELECT id FROM transactions WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 1`, [TEN]);
  await su();
  check('setup', 'fixtures: charge allocated by the invoker trigger when the cashier collected rent',
    n(await val(`SELECT count(*) FROM tenant_charge_allocations WHERE transaction_id = $1`, [TX])) >= 1);

  // ── what each approved role can read, before ──────────────────────────────
  const relations = (await rows(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v') ORDER BY 1`)).map((r) => r.relname);
  const matrix = async () => {
    const m = {};
    for (const who of ['owner', 'admin', 'accountant', 'cashier', 'viewer']) {
      await as(who);
      m[who] = {};
      for (const t of relations) {
        const r = await attempt(() => val(`SELECT count(*) FROM public.${t}`));
        m[who][t] = r.ok ? n(r.value) : 'denied';
      }
    }
    await su();
    return m;
  };
  const visibleBefore = await matrix();

  // ── the defects, reproduced on the baseline (informational; rolled back, savepoints keep the transaction alive) ──
  const sp = async (sql, p) => {
    await db.exec('SAVEPOINT sp');
    try { const r = await db.query(sql, p); await db.exec('RELEASE SAVEPOINT sp'); return { ok: true, affected: r.affectedRows ?? 0 }; }
    catch (e) { await db.exec('ROLLBACK TO SAVEPOINT sp'); return { ok: false, error: e.message }; }
  };
  await inTx(async () => {
    await as('stranger0');
    const w1 = await sp(`UPDATE tenants_rent_status SET monthly_rent = 1, id_number = 'HACK' WHERE id = $1`, [TEN]);
    const w2 = await sp(`UPDATE employee_summary SET salary = 1 WHERE id = $1`, [EMP]);
    const w3 = await sp(`INSERT INTO tenants_rent_status (kind, name, is_active) VALUES ('VENDOR', 'intruder', true)`);
    const w4 = await sp(`DELETE FROM employee_summary WHERE id = $1`, [EMP2]);
    info('before', 'a self-registered account rewrote a tenant, an employee, inserted and deleted contacts through the definer views',
      `rent/id=${w1.ok ? w1.affected : w1.error} salary=${w2.ok ? w2.affected : w2.error} insert=${w3.ok ? w3.affected : w3.error} delete=${w4.ok ? w4.affected : w4.error}`);
    await as('viewer');
    const tr = await sp(`TRUNCATE audit_log`);
    info('before', 'a viewer\'s TRUNCATE audit_log (a privilege, not a policy: RLS does not apply to it)', tr.ok ? 'executed' : tr.error);
    await as('accountant');
    const u = await sp(`UPDATE journal_lines SET credit = credit + 1000 WHERE journal_id = $1 AND credit > 0`, [JPOST]);
    const d = await sp(`DELETE FROM journal_entries WHERE id = $1`, [JPOST]);
    info('before', 'an accountant edited and deleted a POSTED journal entry in a CLOSED period through REST', `update=${u.ok ? u.affected : u.error} delete=${d.ok ? d.affected : d.error}`);
    await as('cashier');
    const c = await sp(`UPDATE transactions SET amount = 1 WHERE id = $1`, [TX]);
    const o = await sp(`UPDATE cashboxes SET opening_balance = -999999 WHERE id = $1`, [BANK]);
    info('before', 'a cashier updated a posted transaction\'s amount and a cashbox\'s opening balance', `tx=${c.ok ? c.affected : c.error} opening_balance=${o.ok ? o.affected : o.error}`);
    await as('viewer');
    const t = await sp(`UPDATE app_notifications SET title_ar = 'x'`);
    info('before', 'a viewer rewrote notifications', String(t.ok ? t.affected : t.error));
  });

  // ── fingerprint of the baseline ───────────────────────────────────────────
  async function fingerprint() {
    await su();
    const q = async (sql) => (await db.query(sql)).rows.map((r) => JSON.stringify(r)).sort();
    const g = `CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END`;
    return {
      relations: await q(`SELECT c.relname, c.relkind, coalesce(c.reloptions::text, '') o, c.relrowsecurity rls, md5(coalesce(pg_get_viewdef(c.oid), '')) d
        FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'p', 'm')`),
      columns: await q(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public'`),
      tableAcl: await q(`SELECT c.relname, ${g} g, a.privilege_type p, a.is_grantable FROM pg_class c,
        aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'p', 'm')`),
      colAcl: await q(`SELECT c.relname, a.attname, pg_get_userbyid(x.grantee) g, x.privilege_type p FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid,
        aclexplode(a.attacl) x WHERE c.relnamespace = 'public'::regnamespace AND a.attacl IS NOT NULL`),
      functions: await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, md5(pg_get_functiondef(p.oid)) body FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'`),
      fnAcl: await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, ${g} g FROM pg_proc p,
        aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND a.privilege_type = 'EXECUTE'`),
      policies: await q(`SELECT tablename, policyname, permissive, roles::text r, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`),
      triggers: await q(`SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) d FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace`),
      publication: await q(`SELECT pubname, tablename FROM pg_publication_tables`),
      defaultAcl: await q(`SELECT defaclrole::regrole::text r, defaclnamespace::regnamespace::text ns, defaclobjtype t,
        (SELECT string_agg(${g} || ':' || a.privilege_type, ',' ORDER BY ${g}, a.privilege_type) FROM aclexplode(defaclacl) a) a FROM pg_default_acl`),
      backup: await q(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'migration_backup'::regnamespace AND c.relname LIKE 'm086%'`),
    };
  }
  const diff = (a, b) => {
    const out = [];
    for (const k of Object.keys(a)) {
      const sa = new Set(a[k]); const sb = new Set(b[k]);
      const added = b[k].filter((x) => !sa.has(x)); const removed = a[k].filter((x) => !sb.has(x));
      if (added.length || removed.length) out.push(`${k}: +${added.length} -${removed.length} ${[...added.slice(0, 2), ...removed.slice(0, 2)].join(' | ').slice(0, 260)}`);
    }
    return out;
  };
  const fp0 = await fingerprint();

  // ── apply 086 (twice) ─────────────────────────────────────────────────────
  const sql086 = read('086_least_privilege.sql');
  const ok1 = await run('apply 086', sql086);
  if (!ok1) { await db.close(); return; }
  const fp1 = await fingerprint();
  const ok2 = await run('re-apply 086 over itself', sql086);
  const fp2 = await fingerprint();
  check('idempotent', '086 applies twice without error and the second run changes nothing', ok2 && diff(fp1, fp2).length === 0, diff(fp1, fp2).join('\n          '));
  check('idempotent', 'the first run changed the catalogue (the test is meaningful)', diff(fp0, fp1).length > 0);

  // ── 1. views ──────────────────────────────────────────────────────────────
  const INVOKER = ['monthly_summary', 'top_expense_categories', 'employee_summary', 'journal_lines_with_categories', 'tenant_rent_summary', 'tenants_rent_status', 'cashbox_balances'];
  const opts = Object.fromEntries((await rows(`SELECT relname, coalesce(reloptions, ARRAY[]::text[]) o FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'v'`)).map((r) => [r.relname, r.o]));
  check('views', 'the seven views that only read contacts/transactions/ledger tables run with the caller\'s rights',
    INVOKER.every((v) => opts[v]?.includes('security_invoker=true')), INVOKER.filter((v) => !opts[v]?.includes('security_invoker=true')).join(','));
  check('views', 'payroll_run_lines_status stays a definer view (it masks salary parts by role) and gets a security barrier',
    !opts.payroll_run_lines_status.includes('security_invoker=true') && opts.payroll_run_lines_status.includes('security_barrier=true'));
  const definerLeft = Object.keys(opts).filter((v) => !opts[v].includes('security_invoker=true'));
  check('views', 'exactly one definer view is left in public', definerLeft.length === 1 && definerLeft[0] === 'payroll_run_lines_status', definerLeft.join(','));
  const viewWrites = await rows(`SELECT c.relname, x.priv, r.rolname FROM pg_class c CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) x(priv)
    CROSS JOIN (VALUES ('authenticated'), ('anon')) r(rolname)
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' AND has_table_privilege(r.rolname, c.oid, x.priv)`);
  check('views', 'no view carries INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for authenticated or anon', viewWrites.length === 0, JSON.stringify(viewWrites.slice(0, 3)));
  const contactsSnapshot = JSON.stringify(await rows(`SELECT id, kind, name, salary, monthly_rent, id_number FROM contacts ORDER BY id`));
  for (const who of ['stranger0', 'viewer', 'cashier', 'accountant']) {
    await as(who === 'stranger0' ? 'stranger0' : who);
    const results4 = [
      await blocked(`UPDATE tenants_rent_status SET monthly_rent = 1, id_number = 'HACK' WHERE id = $1`, [TEN]),
      await blocked(`UPDATE employee_summary SET salary = 1 WHERE id = $1`, [EMP]),
      await blocked(`INSERT INTO tenants_rent_status (kind, name, is_active) VALUES ('VENDOR', 'intruder', true)`),
      await blocked(`DELETE FROM employee_summary WHERE id = $1`, [EMP]),
    ];
    check('views', `${who}: cannot write contacts through tenants_rent_status or employee_summary`, results4.every(Boolean), JSON.stringify(results4));
  }
  await su();
  check('views', 'contacts are untouched by those attempts', JSON.stringify(await rows(`SELECT id, kind, name, salary, monthly_rent, id_number FROM contacts ORDER BY id`)) === contactsSnapshot);
  // payroll masking is intact
  await as('cashier');
  const cashierLine = await one(`SELECT net, outstanding, base_salary, allowances, bonuses, advance_plan, gross FROM payroll_run_lines_status LIMIT 1`);
  check('views', 'cashier still sees net and outstanding on payroll lines but no salary parts',
    cashierLine && cashierLine.net !== null && cashierLine.outstanding !== null && cashierLine.base_salary === null && cashierLine.allowances === null
    && cashierLine.bonuses === null && cashierLine.advance_plan === null && cashierLine.gross === null, JSON.stringify(cashierLine));
  await as('accountant');
  check('views', 'accountant still sees the salary parts', (await one(`SELECT base_salary FROM payroll_run_lines_status LIMIT 1`))?.base_salary !== null);
  await as('viewer');
  check('views', 'viewer sees no payroll lines', n(await val(`SELECT count(*) FROM payroll_run_lines_status`)) === 0);
  check('views', 'a viewer\'s own filter on the masked view cannot be used to probe values (no rows at all)',
    n(await val(`SELECT count(*) FROM payroll_run_lines_status WHERE net > 0 OR employee_id IS NOT NULL`)) === 0);
  await su();
  check('views', 'definer view contents match the base tables for the owner (net total)',
    near(await val(`SELECT sum(net) FROM payroll_run_lines`), await (async () => { await as('owner'); return val(`SELECT sum(net) FROM payroll_run_lines_status`); })()));

  // ── 2. what each approved role can read is unchanged (except other people's drafts) ──
  const visibleAfter = await matrix();
  const moved = [];
  for (const who of Object.keys(visibleBefore)) {
    for (const t of relations) if (visibleBefore[who][t] !== visibleAfter[who][t]) moved.push(`${who}.${t}:${visibleBefore[who][t]}->${visibleAfter[who][t]}`);
  }
  const allowedMoves = (m) => /\.(transaction_form_drafts|journal_form_drafts):/.test(m);
  check('read-access', 'what owner, admin, accountant, cashier and viewer can read is unchanged, except other users\' form drafts',
    moved.every(allowedMoves) && moved.length > 0, moved.filter((m) => !allowedMoves(m)).join(' '));
  check('read-access', 'a user sees only their own form drafts (before: everyone saw everyone\'s)',
    visibleAfter.cashier.transaction_form_drafts === 1 && visibleAfter.owner.transaction_form_drafts === 1
    && visibleAfter.accountant.transaction_form_drafts === 0 && visibleAfter.viewer.journal_form_drafts === 0, JSON.stringify(moved));

  // ── 3. table privileges ───────────────────────────────────────────────────
  await su();
  const hasMaintain = n(await val(`SHOW server_version_num`)) >= 170000;
  const extra = await rows(`SELECT c.relname, x.priv, r.rolname FROM pg_class c CROSS JOIN unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER'${hasMaintain ? ",'MAINTAIN'" : ''}]) x(priv)
    CROSS JOIN (VALUES ('authenticated'), ('anon')) r(rolname)
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND has_table_privilege(r.rolname, c.oid, x.priv)`);
  check('privileges', 'no table carries TRUNCATE/REFERENCES/TRIGGER' + (hasMaintain ? '/MAINTAIN' : '') + ' for authenticated or anon', extra.length === 0, JSON.stringify(extra.slice(0, 3)));
  const anonAny = await rows(`SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','v','p')
    AND has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')`);
  check('privileges', 'anon has no privilege, table or column level, on anything in public', anonAny.length === 0, anonAny.map((r) => r.relname).join(','));
  // The write surface of the API role, table by table. A new table that appears here without a decision fails the run.
  const EXPECTED = {
    budgets: 'DELETE,INSERT,UPDATE', cashboxes: 'DELETE,INSERT,UPDATE', categories: 'DELETE,INSERT,UPDATE', contacts: 'DELETE',
    correspondence_letters: 'DELETE,INSERT,UPDATE', disbursement_voucher_lines: 'DELETE,INSERT,UPDATE', disbursement_vouchers: 'DELETE,INSERT,UPDATE',
    fiscal_periods: 'INSERT,UPDATE', journal_entries: 'DELETE', journal_form_drafts: 'DELETE,INSERT,UPDATE', lease_contracts: 'DELETE,INSERT,UPDATE',
    mall_units: 'DELETE,INSERT,UPDATE', profiles: 'UPDATE', receipt_voucher_lines: 'DELETE,INSERT,UPDATE', receipt_vouchers: 'DELETE,INSERT,UPDATE',
    tenant_charge_allocations: 'INSERT', tenant_charges: 'INSERT,UPDATE', transaction_form_drafts: 'DELETE,INSERT,UPDATE', transactions: 'DELETE,INSERT',
  };
  const surface = Object.fromEntries((await rows(`SELECT c.relname, string_agg(x.priv, ',' ORDER BY x.priv) p FROM pg_class c CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE']) x(priv)
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND has_table_privilege('authenticated', c.oid, x.priv) GROUP BY 1`)).map((r) => [r.relname, r.p]));
  const drift = [...new Set([...Object.keys(EXPECTED), ...Object.keys(surface)])].filter((t) => (EXPECTED[t] ?? '') !== (surface[t] ?? ''))
    .map((t) => `${t}: expected [${EXPECTED[t] ?? ''}] got [${surface[t] ?? ''}]`);
  check('privileges', 'the API write surface is exactly the set the app uses (src .from().insert/update/delete + the triggers that write as the caller)', drift.length === 0, drift.join(' | '));
  const colGrants = (await rows(`SELECT a.attname, string_agg(x.privilege_type, ',' ORDER BY x.privilege_type) p FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid, aclexplode(a.attacl) x
    WHERE c.oid = 'public.app_notifications'::regclass AND x.grantee = 'authenticated'::regrole GROUP BY 1`));
  check('privileges', 'app_notifications: authenticated may update only is_read', colGrants.length === 1 && colGrants[0].attname === 'is_read' && colGrants[0].p === 'UPDATE', JSON.stringify(colGrants));
  check('privileges', 'contacts: column grants intact, portal_token still unreadable and unwritable by authenticated',
    !(await val(`SELECT has_column_privilege('authenticated', 'public.contacts', 'portal_token', 'SELECT')`))
    && !(await val(`SELECT has_column_privilege('authenticated', 'public.contacts', 'portal_token', 'UPDATE')`))
    && (await val(`SELECT has_column_privilege('authenticated', 'public.contacts', 'salary', 'SELECT')`)));
  check('privileges', 'app_secrets: nothing for authenticated or anon', !(await val(`SELECT has_any_column_privilege('authenticated', 'public.app_secrets', 'SELECT, INSERT, UPDATE')`)));
  // a table created later does not regain the privileges
  await su();
  await db.exec(`CREATE TABLE public.zz_probe_086 (id int)`);
  const probeAcl = await rows(`SELECT r.rolname, x.priv FROM (VALUES ('authenticated'), ('anon')) r(rolname) CROSS JOIN unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER'${hasMaintain ? ",'MAINTAIN'" : ''}]) x(priv)
    WHERE has_table_privilege(r.rolname, 'public.zz_probe_086', x.priv)`);
  const probeAnon = await val(`SELECT has_any_column_privilege('anon', 'public.zz_probe_086', 'SELECT, INSERT, UPDATE')`);
  await db.exec(`DROP TABLE public.zz_probe_086`);
  check('privileges', 'a table created afterwards does not regain TRUNCATE/REFERENCES/TRIGGER or any anon privilege', probeAcl.length === 0 && !probeAnon, JSON.stringify(probeAcl));

  // ── 4. the writes the app really does still work ──────────────────────────
  const fx = {};
  await as('cashier');
  fx.cashierTx = await changed(`INSERT INTO transactions (kind, status, method, amount, tx_date, category_id, cashbox_id) VALUES ('EXPENSE', 'POSTED', 'CASH', 10, CURRENT_DATE, $1, $2)`, [cat['EXP-MNT'], CASH]);
  check('app-writes', 'cashier inserts a transaction', fx.cashierTx);
  const TX2 = await val(`SELECT id FROM transactions WHERE amount = 10 ORDER BY created_at DESC LIMIT 1`);
  check('app-writes', 'cashier deletes a transaction', await changed(`DELETE FROM transactions WHERE id = $1`, [TX2]));
  await db.query(`INSERT INTO transactions (kind, status, method, amount, tx_date, description, category_id, cashbox_id, contact_id)
    VALUES ('REVENUE', 'POSTED', 'CASH', 300, CURRENT_DATE, 'تحصيل ثانٍ', $1, $2, $3)`, [cat['REV-RNT'], CASH, TEN]);
  await su();
  check('app-writes', 'a second rent collection still allocates to the charge (the invoker trigger writes tenant_charges and allocations as the cashier)',
    near(await val(`SELECT sum(a.amount) FROM tenant_charge_allocations a JOIN transactions t ON t.id = a.transaction_id WHERE t.contact_id = $1`, [TEN]), 800));
  await as('cashier');
  check('app-writes', 'cashier cannot change an existing transaction\'s amount (no UI path ever updates transactions)', await blocked(`UPDATE transactions SET amount = 1 WHERE id = $1`, [TX]));
  const newContact = await mk({ kind: 'CUSTOMER', name: 'عميل جديد' });
  check('app-writes', 'cashier creates a contact (RPC) and edits it directly', await changed(`UPDATE contacts SET phone = '0910000000', name = 'عميل معدّل' WHERE id = $1`, [newContact]));
  check('app-writes', 'cashier deletes a contact without history', await changed(`DELETE FROM contacts WHERE id = $1`, [newContact]));
  check('app-writes', 'cashier cannot rewrite portal_token', await blocked(`UPDATE contacts SET portal_token = 'x' WHERE id = $1`, [TEN]));
  const unit = await val(`INSERT INTO mall_units (unit_number, floor, area_sqm) VALUES ('Z-9', '1', 20) RETURNING id`);
  check('app-writes', 'cashier updates and deletes a mall unit', await changed(`UPDATE mall_units SET notes = 'n' WHERE id = $1`, [unit]) && await changed(`DELETE FROM mall_units WHERE id = $1`, [unit]));
  const contract = await val(`SELECT id FROM lease_contracts WHERE tenant_id = $1 LIMIT 1`, [TEN]);
  check('app-writes', 'cashier updates a lease contract', await changed(`UPDATE lease_contracts SET deposit_amount = deposit_amount WHERE id = $1`, [contract]));
  check('app-writes', 'cashier inserts a tenant charge', await changed(`INSERT INTO tenant_charges (contract_id, amount, due_date, type, description) VALUES ($1, 50, CURRENT_DATE, 'SERVICE', 'خدمة')`, [contract]));
  check('app-writes', 'cashier cannot delete a tenant charge directly', await blocked(`DELETE FROM tenant_charges WHERE contract_id = $1`, [contract]));
  const rv = await val(`INSERT INTO receipt_vouchers (receipt_number, receipt_date, payer_name, total_amount) VALUES ('R-LP-1', CURRENT_DATE, 'دافع', 10) RETURNING id`);
  check('app-writes', 'cashier writes a receipt voucher with lines and deletes it',
    await changed(`INSERT INTO receipt_voucher_lines (receipt_id, description, amount) VALUES ($1, 'بند', 10)`, [rv])
    && await changed(`UPDATE receipt_vouchers SET notes = 'n' WHERE id = $1`, [rv]) && await changed(`DELETE FROM receipt_vouchers WHERE id = $1`, [rv]));
  check('app-writes', 'cashier writes a letter', await changed(`INSERT INTO correspondence_letters (letter_number, letter_date, letter_type, subject, recipient_name, body) VALUES ('L-LP-1', CURRENT_DATE, 'routine', 's', 'r', 'b')`));
  const dv = await val(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, total_amount) VALUES ('D-LP-1', CURRENT_DATE, 'مستفيد', 10) RETURNING id`);
  check('app-writes', 'cashier drafts a disbursement voucher with a line, edits it and deletes it',
    await changed(`INSERT INTO disbursement_voucher_lines (voucher_id, description, amount) VALUES ($1, 'بند', 10)`, [dv])
    && await changed(`UPDATE disbursement_vouchers SET notes = 'n' WHERE id = $1`, [dv]) && await changed(`DELETE FROM disbursement_vouchers WHERE id = $1`, [dv]));
  const myTxDraft = await val(`SELECT id FROM transaction_form_drafts WHERE user_id = $1`, [U.cashier]);
  check('app-writes', 'cashier saves, updates and deletes their own form drafts',
    await changed(`INSERT INTO transaction_form_drafts (user_id, kind, label, payload) VALUES ($1, 'EXPENSE', 'd2', '{}'::jsonb)`, [U.cashier])
    && await changed(`UPDATE transaction_form_drafts SET label = 'x' WHERE id = $1 AND user_id = $2`, [myTxDraft, U.cashier])
    && await changed(`DELETE FROM transaction_form_drafts WHERE id = $1 AND user_id = $2`, [myTxDraft, U.cashier])
    && await changed(`INSERT INTO journal_form_drafts (user_id, label, payload) VALUES ($1, 'j2', '{}'::jsonb)`, [U.cashier]));
  check('app-writes', 'cashier cannot read, change, delete or plant another user\'s draft',
    n(await val(`SELECT count(*) FROM transaction_form_drafts WHERE user_id = $1`, [U.owner])) === 0
    && await blocked(`UPDATE transaction_form_drafts SET label = 'hijacked' WHERE user_id = $1`, [U.owner])
    && await blocked(`DELETE FROM transaction_form_drafts WHERE user_id = $1`, [U.owner])
    && await blocked(`INSERT INTO transaction_form_drafts (user_id, kind, label, payload) VALUES ($1, 'EXPENSE', 'planted', '{}'::jsonb)`, [U.owner]));
  check('app-writes', 'cashier creates and edits a cashbox (cashbox.manage in the app)',
    await changed(`INSERT INTO cashboxes (code, name, name_ar, kind) VALUES ('T-CB2', 'CB2', 'صندوق', 'CASH')`) && await changed(`UPDATE cashboxes SET color = '#fff' WHERE code = 'T-CB2'`));
  check('app-writes', 'cashier marks a notification read', await changed(`UPDATE app_notifications SET is_read = true WHERE is_read = false`));
  check('app-writes', 'cashier edits their own profile name', await changed(`UPDATE profiles SET full_name = 'اسم' WHERE id = $1`, [U.cashier]));
  await as('accountant');
  check('app-writes', 'accountant upserts a budget', await changed(`INSERT INTO budgets (category_id, year, month, amount) VALUES ($1, 2026, 5, 100)`, [cat['EXP-MNT']]));
  check('app-writes', 'accountant adds and edits a category', await changed(`INSERT INTO categories (code, name, name_ar, kind, type) VALUES ('EXP-LP1', 'x', 'بند', 'EXPENSE', 'EXPENSE')`)
    && await changed(`UPDATE categories SET color = '#000' WHERE code = 'EXP-LP1'`));
  check('app-writes', 'accountant adds, closes and reopens a fiscal period', await changed(`INSERT INTO fiscal_periods (name, start_date, end_date) VALUES ('2031-01', '2031-01-01', '2031-01-31')`)
    && await changed(`UPDATE fiscal_periods SET is_closed = true WHERE name = '2031-01'`) && await changed(`UPDATE fiscal_periods SET is_closed = false WHERE name = '2031-01'`));
  check('app-writes', 'accountant deletes a DRAFT journal entry (the app does this directly)', await changed(`DELETE FROM journal_entries WHERE id = $1 AND status = 'DRAFT'`, [JDRAFT])
    && n(await val(`SELECT count(*) FROM journal_lines WHERE journal_id = $1`, [JDRAFT])) === 0);
  const jNew = await mkJournal('LP-4', '2026-03-10');
  check('app-writes', 'accountant updates (RPC), posts and reverses a journal entry', (await attempt(() => val(`SELECT update_journal_entry($1, 'LP-4b', '2026-03-10', 'edited', NULL, $2::jsonb)`, [jNew, JSON.stringify(JL)]))).ok
    && (await attempt(() => val(`SELECT post_journal_entry($1::text)`, [jNew]))).ok && (await attempt(() => val(`SELECT reverse_journal_entry($1::text)`, [jNew]))).ok);
  await as('admin');
  check('app-writes', 'admin changes another user\'s role (profiles update)', await changed(`UPDATE profiles SET role = 'accountant' WHERE id = $1`, [U.accountant]));
  await as('owner');
  check('app-writes', 'owner changes a role, including to owner and back', await changed(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [U.admin]));
  await su();
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.query(`UPDATE profiles SET role = 'accountant' WHERE id = $1`, [U.accountant]);

  // ── 5. what is now refused ────────────────────────────────────────────────
  await as('accountant');
  check('refused', 'accountant cannot edit a POSTED entry\'s lines in a CLOSED period', await blocked(`UPDATE journal_lines SET credit = credit + 1000 WHERE journal_id = $1 AND credit > 0`, [JPOST]));
  check('refused', 'accountant cannot add a line to a posted entry', await blocked(`INSERT INTO journal_lines (journal_id, category_id, debit, credit, description, sort_order) VALUES ($1, $2, 9999, 0, 'x', 9)`, [JPOST, cat['EXP-MNT']]));
  check('refused', 'accountant cannot forge a POSTED entry', await blocked(`INSERT INTO journal_entries (reference, entry_date, description, status) VALUES ('X-1', '2026-01-20', 'forged', 'POSTED')`));
  check('refused', 'accountant cannot unpost an entry by editing its status', await blocked(`UPDATE journal_entries SET status = 'DRAFT' WHERE id = $1`, [JPOST]));
  check('refused', 'accountant cannot delete a POSTED entry', await blocked(`DELETE FROM journal_entries WHERE id = $1`, [JPOST]));
  check('refused', 'accountant cannot delete a fiscal period (the way a closed month is silently re-opened)', await blocked(`DELETE FROM fiscal_periods WHERE is_closed`));
  check('refused', 'accountant cannot write account_mappings, branches or cash_transfers directly',
    await blocked(`UPDATE account_mappings SET description = 'x'`) && await blocked(`DELETE FROM account_mappings`) && await blocked(`UPDATE branches SET name = 'x'`)
    && await blocked(`INSERT INTO cash_transfers (from_cashbox_id, to_cashbox_id, amount) VALUES ($1, $2, 1)`, [CASH, BANK]));
  check('refused', 'accountant cannot change a charge allocation or a rent link', await blocked(`UPDATE tenant_charge_allocations SET amount = 1`) && await blocked(`DELETE FROM tenant_charge_allocations`)
    && await blocked(`DELETE FROM tenant_rent_journal_links`));
  check('refused', 'accountant cannot touch the inventory count tables', await blocked(`DELETE FROM cashbox_inventory_runs`) && await blocked(`INSERT INTO cashbox_inventory_runs (notes) VALUES ('x')`));
  check('refused', 'journal entries: the RPCs still own the posted rows (posted entry unchanged, balanced)',
    near(await val(`SELECT sum(debit) - sum(credit) FROM journal_lines WHERE journal_id = $1`, [JPOST]), 0) && (await val(`SELECT status FROM journal_entries WHERE id = $1`, [JPOST])) === 'POSTED');
  await as('viewer');
  check('refused', 'notification titles and links cannot be rewritten, only is_read', await blocked(`UPDATE app_notifications SET title_ar = 'x', href = 'https://evil.example'`));
  await as('cashier');
  check('refused', 'notifications cannot be forged by a writer', await blocked(`INSERT INTO app_notifications (kind, title_ar, href, severity) VALUES ('SYSTEM', 'حوّل المبلغ', 'https://evil.example', 'danger')`));
  check('refused', 'a notification title cannot be rewritten by a writer either', await blocked(`UPDATE app_notifications SET title_ar = 'x', href = 'https://evil.example'`));
  check('refused', 'cashier cannot insert a profile or delete one', await blocked(`INSERT INTO profiles (id, role) VALUES (gen_random_uuid(), 'viewer')`) && await blocked(`DELETE FROM profiles WHERE id = $1`, [U.viewer]));
  for (const who of ['cashier', 'viewer', 'accountant']) {
    await as(who);
    const t = await errorOf(`TRUNCATE audit_log`);
    check('refused', `${who}: TRUNCATE on audit_log or journal tables fails`, /permission denied/.test(t) && /permission denied/.test(await errorOf(`TRUNCATE journal_lines`)) && /permission denied/.test(await errorOf(`TRUNCATE contacts`)), t);
  }

  // ── 6. the ledger and audit log cannot be altered by API roles, even service_role ──
  await asService();
  check('append-only', 'service_role cannot update or delete audit_log rows', /غير مصرح|permission/.test(await errorOf(`UPDATE audit_log SET summary_ar = 'x'`))
    && /غير مصرح|permission/.test(await errorOf(`DELETE FROM audit_log`)));
  check('append-only', 'service_role cannot forge or truncate audit_log', /غير مصرح|permission/.test(await errorOf(`INSERT INTO audit_log (action, entity_type, summary_ar) VALUES ('INSERT', 'x', 'forged')`))
    && /غير مصرح|permission/.test(await errorOf(`TRUNCATE audit_log`)));
  const svcErrors = [
    await errorOf(`UPDATE journal_lines SET credit = 1 WHERE journal_id = $1`, [JPOST]), await errorOf(`UPDATE journal_entries SET description = 'x' WHERE id = $1`, [JPOST]),
    await errorOf(`DELETE FROM journal_entries WHERE id = $1`, [JPOST]), await errorOf(`TRUNCATE journal_entries CASCADE`),
  ];
  check('append-only', 'service_role cannot edit posted journal lines or entries', svcErrors.every((e) => /غير مصرح/.test(e)), svcErrors.map((e) => e.slice(0, 50)).join(' | '));
  check('append-only', 'service_role can still read everything and delete a draft entry', n(await val(`SELECT count(*) FROM journal_entries`)) > 0
    && await changed(`DELETE FROM journal_entries WHERE id = $1`, [JDRAFT2]));
  await su();
  check('append-only', 'the database owner (SQL editor, migrations, repair scripts) is not blocked', await changed(`UPDATE audit_log SET summary_ar = summary_ar WHERE id = (SELECT id FROM audit_log LIMIT 1)`)
    && (await attempt(() => db.query(`UPDATE journal_entries SET description = description WHERE id = $1`, [JPOST]))).ok);
  check('append-only', 'the audit log is still written by the system for every change (definer triggers pass)', n(await val(`SELECT count(*) FROM audit_log`)) >= 5);
  // (deleting a cashbox through the API fails on the baseline already: audit_cashbox_changes writes an audit row that points at the
  //  cashbox being deleted. So the audit_log.cashbox_id ON DELETE SET NULL path cannot be reached from an API role; see the report.)
  const ghost = '12121212-1212-4212-8212-121212121212';
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'ghost@test.local')`, [ghost]);
  await db.query(`INSERT INTO audit_log (action, entity_type, summary_ar, actor_id) VALUES ('INSERT', 'x', 'من شبح', $1)`, [ghost]);
  await db.query(`DELETE FROM auth.users WHERE id = $1`, [ghost]);
  check('append-only', 'deleting an auth user still nulls audit_log.actor_id', n(await val(`SELECT count(*) FROM audit_log WHERE summary_ar = 'من شبح' AND actor_id IS NULL`)) === 1);

  // ── 7. self-registration ──────────────────────────────────────────────────
  await su();
  check('sign-up', 'accounts that existed when 086 was applied are approved, roles untouched',
    n(await val(`SELECT count(*) FROM profiles WHERE id IN ($1,$2,$3,$4,$5) AND approved_at IS NOT NULL`, [U.owner, U.admin, U.accountant, U.cashier, U.viewer])) === 5
    && (await val(`SELECT role FROM profiles WHERE id = $1`, [U.owner])) === 'owner');
  await signUp('stranger1');
  const s1 = await one(`SELECT role, approved_at FROM profiles WHERE id = $1`, [U.stranger1]);
  check('sign-up', 'a new sign-up through the auth service lands pending: role viewer, approved_at NULL', s1?.role === 'viewer' && s1?.approved_at === null, JSON.stringify(s1));
  await as('stranger1');
  const strangerCounts = {};
  for (const t of relations) {
    // journal_summary is an aggregate without GROUP BY: it always returns one row, of zeros, when it sees nothing
    const r = await attempt(() => val(t === 'journal_summary' ? `SELECT total_entries FROM public.journal_summary` : `SELECT count(*) FROM public.${t}`));
    strangerCounts[t] = r.ok ? n(r.value) : 'denied';
  }
  const leaks = Object.entries(strangerCounts).filter(([t, c]) => c !== 0 && c !== 'denied' && !(t === 'profiles' && c === 1));
  check('sign-up', 'a pending account reads no row of any table or view (only its own profile)', leaks.length === 0, leaks.map(([t, c]) => `${t}=${c}`).join(' '));
  check('sign-up', 'a pending account cannot approve itself, or write anything', /غير مصرح|42501/.test(await errorOf(`UPDATE profiles SET approved_at = now() WHERE id = $1`, [U.stranger1]))
    && await blocked(`UPDATE profiles SET role = 'owner' WHERE id = $1`, [U.stranger1]) && await blocked(`INSERT INTO app_notifications (title_ar) VALUES ('x')`)
    && await blocked(`INSERT INTO contacts (kind, name) VALUES ('VENDOR', 'x')`) && await blocked(`UPDATE tenants_rent_status SET monthly_rent = 1`)
    && await blocked(`INSERT INTO transactions (kind, status, method, amount, category_id, cashbox_id) VALUES ('EXPENSE', 'POSTED', 'CASH', 1, $1, $2)`, [cat['EXP-MNT'], CASH]));
  check('sign-up', 'a pending account can still edit its own name', await changed(`UPDATE profiles SET full_name = 'غريب' WHERE id = $1`, [U.stranger1]));
  const gapRows = await attempt(() => rows(`SELECT count(*) c FROM get_journal_entries_for_period('2026-01-01', '2026-12-31', NULL, 100, 0)`));
  info('sign-up', 'KNOWN GAP until api_pre_request is activated: read RPCs do not pass through RLS, a pending account can still call them',
    `get_journal_entries_for_period rows=${gapRows.ok ? gapRows.value[0].c : gapRows.error?.slice(0, 40)}; get_balance_sheet ok=${(await attempt(() => val(`SELECT get_balance_sheet(CURRENT_DATE)`))).ok}`);
  const pre = await attempt(() => val(`SELECT api_pre_request()`));
  check('sign-up', 'api_pre_request refuses a pending account', !pre.ok && /42501|بانتظار/.test((pre.error ?? '') + (pre.code ?? '')), pre.error);
  for (const who of ['owner', 'viewer', 'cashier']) {
    await as(who);
    check('sign-up', `api_pre_request lets ${who} through`, (await attempt(() => val(`SELECT api_pre_request()`))).ok);
  }
  await asService();
  check('sign-up', 'api_pre_request lets service_role through', (await attempt(() => val(`SELECT api_pre_request()`))).ok);
  await actAs(db, 'anon');
  check('sign-up', 'anon cannot execute api_pre_request or auth_is_member (anon has no function at all)', !(await attempt(() => val(`SELECT api_pre_request()`))).ok && !(await attempt(() => val(`SELECT auth_is_member()`))).ok);
  // approval paths
  await as('accountant');
  check('sign-up', 'an accountant cannot approve a pending account', await blocked(`UPDATE profiles SET full_name = 'x' WHERE id = $1`, [U.stranger1]));
  await as('admin');
  check('sign-up', 'an admin approving by assigning the role: approved, role kept', await changed(`UPDATE profiles SET role = 'cashier' WHERE id = $1`, [U.stranger1]));
  await su();
  const s1b = await one(`SELECT role, approved_at FROM profiles WHERE id = $1`, [U.stranger1]);
  check('sign-up', '… the profile is approved and cashier', s1b?.role === 'cashier' && s1b?.approved_at !== null, JSON.stringify(s1b));
  await as('stranger1');
  check('sign-up', '… and the new member now reads and writes like a cashier', n(await val(`SELECT count(*) FROM transactions`)) > 0
    && await changed(`INSERT INTO transactions (kind, status, method, amount, tx_date, category_id, cashbox_id) VALUES ('EXPENSE', 'POSTED', 'CASH', 1, CURRENT_DATE, $1, $2)`, [cat['EXP-MNT'], CASH]));
  // invite flow: the auth service creates the user and the profile (pending), the invite route then sets the role with the service key
  await signUp('invitee');
  await asService();
  await db.query(`UPDATE profiles SET full_name_ar = 'مدعو', role = 'viewer' WHERE id = $1`, [U.invitee]);
  await su();
  check('sign-up', 'invite flow (service key assigns name and a viewer role) approves the account without any change to the route',
    (await val(`SELECT approved_at IS NOT NULL FROM profiles WHERE id = $1`, [U.invitee])) === true);
  await as('invitee');
  check('sign-up', '… and the invited viewer reads', n(await val(`SELECT count(*) FROM transactions`)) > 0);
  await su();
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.query(`UPDATE profiles SET role = 'cashier' WHERE id = $1`, [U.invitee]);
  // suspension
  await as('owner');
  check('sign-up', 'the owner suspends a member (approved_at = NULL)', await changed(`UPDATE profiles SET approved_at = NULL WHERE id = $1`, [U.invitee]));
  await su();
  check('sign-up', '… the suspended account falls back to viewer', (await val(`SELECT role FROM profiles WHERE id = $1`, [U.invitee])) === 'viewer');
  await as('invitee');
  check('sign-up', '… reads nothing and writes nothing', n(await val(`SELECT count(*) FROM transactions`)) === 0 && await blocked(`INSERT INTO transactions (kind, status, method, amount, category_id, cashbox_id) VALUES ('EXPENSE', 'POSTED', 'CASH', 1, $1, $2)`, [cat['EXP-MNT'], CASH]));
  // direct database session (SQL editor): approves, and a restore keeps approval dates
  await signUp('stranger2');
  await su();
  await db.query(`UPDATE profiles SET approved_at = now() WHERE id = $1`, [U.stranger2]);
  check('sign-up', 'a SQL-editor session can approve with a plain UPDATE', (await val(`SELECT approved_at IS NOT NULL FROM profiles WHERE id = $1`, [U.stranger2])) === true);
  const rid = '13131313-1313-4313-8313-131313131313';
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'restored@test.local') ON CONFLICT DO NOTHING`, [rid]);
  await db.query(`INSERT INTO profiles (id, role, approved_at) VALUES ($1, 'viewer', '2025-01-01') ON CONFLICT (id) DO UPDATE SET approved_at = EXCLUDED.approved_at`, [rid]);
  check('sign-up', 'a restore (direct session) keeps the approval date it restores', (await val(`SELECT approved_at::date::text FROM profiles WHERE id = $1`, [rid])) === '2025-01-01');
  await as('owner');
  check('sign-up', 'owner and admin keep full access to the profiles list', n(await val(`SELECT count(*) FROM profiles`)) >= 8);
  await as('viewer');
  check('sign-up', 'the original viewer account is untouched: still reads the ledger and the team', n(await val(`SELECT count(*) FROM transactions`)) > 0 && n(await val(`SELECT count(*) FROM profiles`)) >= 8);

  // ── 8. realtime and the rest ──────────────────────────────────────────────
  await su();
  const pub = (await rows(`SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY 1`)).map((r) => r.tablename);
  check('realtime', 'supabase_realtime publishes only app_notifications (the only table the app subscribes to)', pub.length === 1 && pub[0] === 'app_notifications', pub.join(','));
  check('realtime', 'no policy of the public schema is "USING (true)" for authenticated any more', n(await val(`SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
    AND cmd IN ('SELECT','ALL') AND 'authenticated' = ANY (roles::text[]) AND lower(btrim(coalesce(qual,''))) IN ('true','(true)')`)) === 0);
  check('functions', 'the functions 086 creates are not callable by anon or by PUBLIC, and the guards not by authenticated',
    !(await val(`SELECT bool_or(has_function_privilege(r, p.oid, 'EXECUTE')) FROM pg_proc p CROSS JOIN (VALUES ('anon')) x(r) WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('auth_is_member','api_pre_request','guard_profile_approval','guard_ledger_rows','audit_log_append_only')`))
    && !(await val(`SELECT bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('guard_profile_approval','guard_ledger_rows','audit_log_append_only')`))
    && (await val(`SELECT has_function_privilege('authenticated', 'public.auth_is_member()', 'EXECUTE')`)));
  check('functions', 'the guards are SECURITY INVOKER (they must see the real current_user), the member helpers SECURITY DEFINER with a fixed search_path',
    !(await val(`SELECT bool_or(prosecdef) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('guard_ledger_rows','audit_log_append_only')`))
    && (await val(`SELECT bool_and(prosecdef AND proconfig IS NOT NULL) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('auth_is_member','guard_profile_approval')`)));

  // ── 9. the optional blocks ────────────────────────────────────────────────
  const blocks = optionalBlocks(sql086);
  check('optional', 'the three optional blocks are present and each has an UNDO', ['pre-request', 'contacts-masking', 'cashier-cashbox'].every((b) => blocks[b]?.apply && blocks[b]?.undo), Object.keys(blocks).join(','));
  const fpApplied = await fingerprint();
  // pre-request hook: PostgREST config on the authenticator role
  await su();
  await db.exec(`DO $$ BEGIN CREATE ROLE authenticator NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  const hookSet = async () => await val(`SELECT coalesce((SELECT array_to_string(setconfig, ',') FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole WHERE r.rolname = 'authenticator' AND s.setdatabase = 0), '')`);
  check('optional', 'pre-request: the block runs and sets pgrst.db_pre_request on the authenticator role', await run('pre-request block', blocks['pre-request'].apply) && /pgrst\.db_pre_request=public\.api_pre_request/.test(await hookSet()), await hookSet());
  check('optional', 'pre-request: UNDO removes it', await run('pre-request undo', blocks['pre-request'].undo) && !/pgrst\.db_pre_request/.test(await hookSet()), await hookSet());
  // cashier cashbox guard
  check('optional', 'cashier-cashbox: block applies', await run('cashier-cashbox block', blocks['cashier-cashbox'].apply));
  await as('cashier');
  check('optional', 'cashier-cashbox: a cashier cannot change opening_balance or open a cashbox with money, but can edit the rest and open one at zero',
    /غير مصرح/.test(await errorOf(`UPDATE cashboxes SET opening_balance = -999999 WHERE id = $1`, [BANK]))
    && /غير مصرح/.test(await errorOf(`INSERT INTO cashboxes (code, name, name_ar, kind, opening_balance) VALUES ('T-CB3', 'x', 'x', 'CASH', 1000)`))
    && await changed(`UPDATE cashboxes SET color = '#abc' WHERE id = $1`, [BANK]) && await changed(`INSERT INTO cashboxes (code, name, name_ar, kind) VALUES ('T-CB4', 'x', 'x', 'CASH')`));
  await as('accountant');
  check('optional', 'cashier-cashbox: an accountant still sets an opening balance', await changed(`UPDATE cashboxes SET opening_balance = 5100 WHERE id = $1`, [BANK]));
  await su();
  check('optional', 'cashier-cashbox: a SQL-editor session is not blocked', await changed(`UPDATE cashboxes SET opening_balance = 5000 WHERE id = $1`, [BANK]));
  check('optional', 'cashier-cashbox: UNDO removes the trigger', await run('cashier-cashbox undo', blocks['cashier-cashbox'].undo)
    && n(await val(`SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_guard_cashbox_opening_balance'`)) === 0);
  // contacts masking
  const realSalary = await val(`SELECT salary FROM contacts WHERE id = $1`, [EMP]);
  const empRowBefore = JSON.stringify(await rows(`SELECT id, name, salary, hire_date, last_12_months_salary_paid FROM employee_summary ORDER BY id`));
  const tenRowBefore = JSON.stringify(await rows(`SELECT id, name, id_number, rent_status, rent_paid_this_month FROM tenants_rent_status ORDER BY id`));
  check('optional', 'contacts-masking: block applies', await run('contacts-masking block', blocks['contacts-masking'].apply));
  await as('cashier');
  const direct = await errorOf(`SELECT salary FROM contacts`);
  check('optional', 'contacts-masking: reading salary/id_number from the table is refused for every role', /permission denied/.test(direct) && /permission denied/.test(await errorOf(`SELECT id_number FROM contacts`)), direct);
  const cm = await one(`SELECT salary, id_number, name FROM contacts_masked WHERE id = $1`, [EMP]);
  check('optional', 'contacts-masking: a cashier gets NULL salary and id_number from contacts_masked, the rest intact', cm && cm.salary === null && cm.id_number === null && cm.name === 'موظف اختبار', JSON.stringify(cm));
  const ces = await one(`SELECT name, salary FROM employee_summary WHERE id = $1`, [EMP]);
  const cts = await one(`SELECT id_number, rent_status FROM tenants_rent_status WHERE id = $1`, [TEN]);
  check('optional', 'contacts-masking: employee_summary and tenants_rent_status still work for a cashier, masked', ces?.salary === null && cts?.id_number === null && cts?.rent_status !== undefined, JSON.stringify([ces, cts]));
  await as('accountant');
  const am = await one(`SELECT salary, id_number FROM contacts_masked WHERE id = $1`, [EMP]);
  check('optional', 'contacts-masking: an accountant sees the real values', near(am?.salary, realSalary) && am?.id_number === '119900445566', JSON.stringify(am));
  check('optional', 'contacts-masking: and the views give the accountant exactly what they gave before',
    JSON.stringify(await rows(`SELECT id, name, salary, hire_date, last_12_months_salary_paid FROM employee_summary ORDER BY id`)) === empRowBefore
    && JSON.stringify(await rows(`SELECT id, name, id_number, rent_status, rent_paid_this_month FROM tenants_rent_status ORDER BY id`)) === tenRowBefore);
  check('optional', 'contacts-masking: salary and id_number can still be written to contacts (create/update forms keep working) but not read back',
    await changed(`UPDATE contacts SET salary = 3300 WHERE id = $1`, [EMP]) && (await attempt(() => db.query(`UPDATE contacts SET salary = 3200 WHERE id = $1 RETURNING salary`, [EMP]))).ok === false);
  check('optional', 'contacts-masking: the masked view is not writable', await blocked(`UPDATE contacts_masked SET name = 'x'`) && await blocked(`DELETE FROM contacts_masked`));
  await su();
  await db.query(`UPDATE profiles SET approved_at = NULL WHERE id = $1`, [U.stranger2]);
  await as('stranger2');
  check('optional', 'contacts-masking: a pending account sees nothing in the masked view (a definer view must apply the member gate itself)', n(await val(`SELECT count(*) FROM contacts_masked`)) === 0);
  await su();
  await db.query(`UPDATE profiles SET approved_at = now() WHERE id = $1`, [U.stranger2]);
  check('optional', 'contacts-masking: UNDO restores the columns and the original views', await run('contacts-masking undo', blocks['contacts-masking'].undo));
  await as('cashier');
  check('optional', 'contacts-masking: … after UNDO a cashier reads salary again, views are the original ones',
    near(await val(`SELECT salary FROM contacts WHERE id = $1`, [EMP]), 3300) && n(await val(`SELECT count(*) FROM pg_class WHERE relname = 'contacts_masked'`)) === 0);
  await su();
  await db.query(`UPDATE contacts SET salary = $2 WHERE id = $1`, [EMP, realSalary]);
  await run('drop optional leftovers', `DROP TABLE IF EXISTS migration_backup.m086_opt_views`);
  await run('drop optional role', `DROP ROLE IF EXISTS authenticator`);
  const fpAfterOptional = await fingerprint();
  const dOpt = diff(fpApplied, fpAfterOptional);
  check('optional', 'applying each optional block and its UNDO leaves the catalogue exactly as it was', dOpt.length === 0, dOpt.join('\n          '));

  // ── 10. rollback ──────────────────────────────────────────────────────────
  check('rollback', 'ROLLBACK runs', await run('086 rollback', read('086_least_privilege.ROLLBACK.sql')));
  const fpRolled = await fingerprint();
  const dRb = diff(fp0, fpRolled);
  check('rollback', 'after the rollback the catalogue is identical to the baseline (relations, columns, grants, policies, triggers, functions, publication, default privileges)', dRb.length === 0, dRb.join('\n          '));
  await as('stranger0');
  check('rollback', 'the baseline defects are back after the rollback (the rollback really reverts)', await changed(`UPDATE tenants_rent_status SET monthly_rent = monthly_rent WHERE id = $1`, [TEN]));
  await su();
  const second = await attempt(() => db.exec(read('086_least_privilege.ROLLBACK.sql')));
  try { await db.exec('ROLLBACK'); } catch {}
  check('rollback', 'a second rollback fails clearly instead of damaging anything', !second.ok && /086/.test(second.error ?? ''), second.error);
  await su();
  check('rollback', '086 applies again after a rollback', await run('086 re-apply after rollback', sql086));
  const fpAgain = await fingerprint();
  const dAgain = diff(fp1, fpAgain);
  check('rollback', '… to the same catalogue as the first time', dAgain.length === 0, dAgain.join('\n          '));

  await db.close();
}

// ── children: the long-form suites with 086 applied ─────────────────────────
function failures(out) {
  return new Set(out.split('\n').filter((l) => /^\s*FAIL\b/.test(l)).map((l) => l.replace(/^\s*FAIL\s+/, '').trim()));
}
function summary(out) {
  const m = out.match(/(\d+) passed, (\d+) failed/);
  return m ? `${m[1]} passed, ${m[2]} failed` : out.split('\n').slice(-3).join(' ').slice(0, 120);
}
function childSuites() {
  pass = 'regression';
  const accArgs = ['scripts/test-accounting-scenarios.mjs'];
  const withFiles = (files) => files.flatMap((f) => ['--apply', `${DIR}/${f}`]);
  const baseFiles = ['078_security_and_ledger_fixes.sql', '080_payroll.sql', '081_rent_safety.sql', '082_role_and_voucher_guards.sql'];
  const a0 = spawnSync(process.execPath, [...accArgs, ...withFiles(baseFiles)], { encoding: 'utf8', timeout: 900000 });
  const a1 = spawnSync(process.execPath, [...accArgs, ...withFiles([...baseFiles, '086_least_privilege.sql'])], { encoding: 'utf8', timeout: 900000 });
  const f0 = failures(a0.stdout ?? ''); const f1 = failures(a1.stdout ?? '');
  const fresh = [...f1].filter((x) => !f0.has(x));
  check('regression', 'accounting scenarios (rent allocation, vouchers, ledger, roles, closed periods) fail on nothing new with 086 applied',
    a1.status !== null && fresh.length === 0 && /passed/.test(a1.stdout ?? ''), `${summary(a0.stdout ?? '')} -> ${summary(a1.stdout ?? '')} ${fresh.join(' | ')}`);
  info('regression', `accounting scenarios without 086: ${summary(a0.stdout ?? '')} (failures that also exist without 086 are repository-vs-production differences; npm run test:scenarios:proposed runs them against the live function bodies)`);

  // the payroll suite hard-codes its migration list: run a copy of it with 086 added
  let src = readFileSync('scripts/test-payroll-scenarios.mjs', 'utf8');
  const marker = `'docs/proposed-migrations/081_rent_safety.sql']`;
  const patched = src.includes(marker);
  check('regression', 'the payroll suite can be replayed with 086 appended to its migration list', patched);
  if (patched) {
    src = src.replace(`'./lib/pglite-replica.mjs'`, JSON.stringify(pathToFileURL(resolve('scripts/lib/pglite-replica.mjs')).href))
      .replace(marker, `'docs/proposed-migrations/081_rent_safety.sql', 'docs/proposed-migrations/086_least_privilege.sql']`);
    const dir = mkdtempSync(join(tmpdir(), 'tajmall-lp-'));
    const file = join(dir, 'payroll-with-086.mjs');
    writeFileSync(file, src);
    const p0 = spawnSync(process.execPath, ['scripts/test-payroll-scenarios.mjs'], { encoding: 'utf8', timeout: 900000 });
    const p1 = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 900000 });
    const g0 = failures(p0.stdout ?? ''); const g1 = failures(p1.stdout ?? '');
    const freshP = [...g1].filter((x) => !g0.has(x));
    check('regression', 'payroll scenarios (salary structures, runs, advances, payments, masking by role) fail on nothing new with 086 applied',
      /passed/.test(p1.stdout ?? '') && freshP.length === 0, `${summary(p0.stdout ?? '')} -> ${summary(p1.stdout ?? '')} ${freshP.join(' | ')}`);
    info('regression', `payroll scenarios without 086: ${summary(p0.stdout ?? '')}; with 086: ${summary(p1.stdout ?? '')}`);
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
const guarded = async (label, fn) => {
  try { await fn(); } catch (e) { pass = label; check('crash', 'the suite stopped on an unexpected error', false, String(e.message ?? e).slice(0, 400)); }
};
await guarded('086 alone', () => suite('086 alone', { with085: false }));
if (HAS_085) await guarded('085 + 086', () => suite('085 + 086', { with085: true }));
else info('setup', '085_function_hardening.sql not found: only the 086-alone pass ran');
if (!NO_CHILDREN) await guarded('regression', async () => childSuites());

let area = '';
let current = '';
for (const r of results) {
  if (r.pass !== current) { current = r.pass; area = ''; console.log(`\n=== ${current || 'run'} ===`); }
  if (r.area !== area) { area = r.area; console.log(`[${area}]`); }
  const tag = r.ok === null ? 'INFO' : r.ok ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  ${r.name}${(r.ok === true || !r.detail) ? '' : `\n        ↳ ${r.detail}`}`);
}
const counted = results.filter((r) => r.ok !== null);
const failed = counted.filter((r) => !r.ok).length;
console.log(`\n${counted.length - failed} passed, ${failed} failed (${counted.length} checks, ${results.length - counted.length} informational)`);
process.exitCode = failed ? 1 : 0;
