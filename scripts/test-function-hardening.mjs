/**
 * Function hardening (085) on an isolated PGlite replica — never touches production data.
 *
 *   node scripts/test-function-hardening.mjs
 *       baseline = repository migrations + proposed 078, 080, 081, 082 (what production has)
 *   node scripts/test-function-hardening.mjs --live-dump <functions.sql>
 *       + the live function bodies and EXECUTE grants from a read-only dump (the audit's functions.sql), so the
 *         baseline is production's own text, not the repository's
 *   node scripts/test-function-hardening.mjs --with-083-084
 *       + 083 (employee file and leave) and 084 applied before 085, to prove they coexist
 *
 * The run: reproduce each defect on the baseline, apply 085 (twice), check every fix, check that every allowed
 * role still does its job and that every RPC the app calls is still executable, then roll 085 back and compare the
 * catalogue with the baseline, and apply it once more.
 * Exit code is 1 when any check fails.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createReplica, actAs } from './lib/pglite-replica.mjs';

const args = process.argv.slice(2);
const dumpArg = args.includes('--live-dump') ? args[args.indexOf('--live-dump') + 1] : process.env.LIVE_FUNCTIONS_DUMP;
const with083 = args.includes('--with-083-084');
const DIR = 'docs/proposed-migrations';
const read = (f) => readFileSync(`${DIR}/${f}`, 'utf8');

const results = [];
const check = (area, name, ok, detail = '') => results.push({ area, name, ok: Boolean(ok), detail: String(detail ?? '') });
const n = (x) => Number(x ?? 0);
const near = (a, b) => Math.abs(n(a) - n(b)) < 0.001;

const { db } = await createReplica();
const rows = async (sql, p) => (await db.query(sql, p)).rows;
const one = async (sql, p) => (await rows(sql, p))[0];
const val = async (sql, p) => { const r = await one(sql, p); return r ? Object.values(r)[0] : undefined; };
const attempt = async (fn) => { try { return { ok: true, value: await fn() }; } catch (e) { return { ok: false, error: e.message, code: e.code }; } };
const run = async (label, sql) => {
  try { await db.exec(sql); return true; } catch (e) {
    try { await db.exec('ROLLBACK'); } catch {}
    check('setup', label, false, e.message);
    return false;
  }
};
/** The Arabic refusals the functions raise for a caller without the role. */
const denied = (r) => !r.ok && (r.code === '42501' || /صلاحية|غير مصرح|للقراءة|المشاهد|يتطلب|مدير|محاسب|permission denied/.test(r.error ?? ''));

// ── baseline: what production has ───────────────────────────────────────────
for (const f of ['078_security_and_ledger_fixes', '080_payroll', '081_rent_safety', '082_role_and_voucher_guards']) {
  await run(`apply ${f}`, read(`${f}.sql`));
}
if (dumpArg) {
  const text = readFileSync(resolve(dumpArg), 'utf8');
  const chunks = text.split(/^-- ===== /m).slice(1);
  const sigs = [];
  let failed = 0;
  for (const ch of chunks) {
    const lines = ch.split('\n');
    const sig = lines[0].split(' | ')[0];
    const acl = lines[1].replace(/^-- acl=/, '');
    try { await db.exec(lines.slice(2).join('\n').trim()); sigs.push({ sig, acl }); } catch { failed += 1; }
  }
  for (const { sig, acl } of sigs) {
    await db.exec(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated, service_role`);
    for (const item of acl.replace(/[{}]/g, '').split(',').filter(Boolean)) {
      const grantee = item.split('=')[0];
      if (grantee !== 'postgres') await db.exec(`GRANT EXECUTE ON FUNCTION public.${sig} TO ${grantee === '' ? 'PUBLIC' : grantee}`);
    }
  }
  check('setup', `live function bodies and grants overlaid (${sigs.length} of ${chunks.length})`, failed === 0 && sigs.length === chunks.length, `${failed} failed`);
}
if (with083) {
  await run('apply 083', read('083_employee_leave.sql'));
  await run('apply 084', read('084_rent_summary_respects_claim_start.sql'));
}
if (results.some((r) => !r.ok)) {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} ${r.detail}`);
  process.exit(1);
}

// ── fixtures ────────────────────────────────────────────────────────────────
const U = {
  owner: '11111111-1111-4111-8111-111111111111', admin: '55555555-5555-4555-8555-555555555555',
  accountant: '44444444-4444-4444-8444-444444444444', cashier: '33333333-3333-4333-8333-333333333333',
  viewer: '22222222-2222-4222-8222-222222222222',
};
const su = () => actAs(db, 'superuser');
const as = (who) => actAs(db, 'authenticated', U[who]);
const asService = async () => { await actAs(db, 'superuser'); await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`); await db.exec('SET ROLE service_role'); };
await su();
for (const [role, id] of Object.entries(U)) await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${role}@test.local`]);
await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
for (const [role, id] of Object.entries(U)) {
  await db.query(`INSERT INTO profiles (id, role) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [id, role]);
}
await su();
const cat = Object.fromEntries((await rows(`SELECT code, id FROM categories`)).map((r) => [r.code, r.id]));
const REV = cat['REV-PRK'] ?? (await val(`SELECT id FROM categories WHERE type = 'REVENUE' AND active AND code NOT IN ('REV-RNT','REV-SRV') ORDER BY sort_order LIMIT 1`));
const EXP = cat['EXP-MNT'] ?? (await val(`SELECT id FROM categories WHERE type = 'EXPENSE' AND active ORDER BY sort_order LIMIT 1`));
const boxes = await rows(`SELECT id, kind FROM cashboxes WHERE active ORDER BY code`);
const CASH = boxes.find((b) => b.kind === 'CASH')?.id;
const BANK = boxes.find((b) => b.kind === 'BANK')?.id;
check('setup', 'fixtures: categories and two cashboxes exist', REV && EXP && CASH && BANK && cat['AST-CSH'] && cat['REV-RNT']);

await as('owner');
const mkContact = async (payload) => { const r = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify(payload)]); return r?.id ?? r; };
const T1 = await mkContact({ kind: 'TENANT', name: 'مستأجر اختبار', shop_number: 'HRD-1', monthly_rent: 1000 });
const T2 = await mkContact({ kind: 'TENANT', name: 'مستأجر ثانٍ', shop_number: 'HRD-2', monthly_rent: 800 });
const C1 = await mkContact({ kind: 'CUSTOMER', name: 'عميل اختبار' });
await val(`SELECT ensure_tenant_lease_contract($1)`, [T1]);
await val(`SELECT ensure_tenant_lease_contract($1)`, [T2]);

// ── catalogue snapshot (functions, grants, comments, triggers, table grants, default privileges) ──
async function snapshot() {
  await su();
  const q = async (sql) => (await db.query(sql)).rows.map((r) => JSON.stringify(r)).sort();
  return {
    functions: await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, md5(pg_get_functiondef(p.oid)) body, p.proconfig
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'`),
    grants: await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args,
      (SELECT array_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)
         FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.privilege_type = 'EXECUTE') g
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'`),
    comments: await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, obj_description(p.oid, 'pg_proc') c
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'`),
    triggers: await q(`SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) d FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace`),
    appSecrets: await q(`SELECT (SELECT array_agg(DISTINCT pg_get_userbyid(a.grantee) || ':' || a.privilege_type ORDER BY pg_get_userbyid(a.grantee) || ':' || a.privilege_type)
      FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a) a FROM pg_class c WHERE c.oid = to_regclass('public.app_secrets')`),
    defaultAcl: await q(`SELECT defaclrole::regrole::text r, defaclnamespace::regnamespace::text ns, defaclobjtype, defaclacl::text a FROM pg_default_acl`),
    backup: await q(`SELECT nspname FROM pg_namespace WHERE nspname = 'migration_backup'`),
  };
}
const sameSnapshot = (a, b) => Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
  .map((k) => {
    const before = new Set(a[k]); const after = new Set(b[k]);
    return `${k}: +${[...after].filter((x) => !before.has(x)).length} -${[...before].filter((x) => !after.has(x)).length} ${[...after].filter((x) => !before.has(x)).slice(0, 2).join(' | ').slice(0, 220)}`;
  });
const baseline = await snapshot();

const callable = (role, sig) => val(`SELECT has_function_privilege('${role}', to_regprocedure($1), 'EXECUTE')`, [sig]);
const TRIGGER_FNS = ['audit_cashbox_changes', 'audit_contact_changes', 'audit_journal_entry_changes', 'audit_lease_contract_changes',
  'audit_tenant_charge_changes', 'audit_transaction_changes', 'auto_allocate_tenant_rent_payment', 'check_fiscal_period_overlap',
  'check_lease_contract_overlap', 'check_transaction_category_kind', 'generate_contact_code', 'handle_new_user',
  'prevent_contact_delete_with_history', 'prevent_role_self_escalation', 'process_disbursement_voucher_posting',
  'process_tenant_charge_posting', 'process_transaction_posting', 'set_transaction_posted', 'set_updated_at',
  'trg_journal_rent_links_on_status', 'trg_rent_link_recalc_charge'];
const PURE_FNS = ['year_close_source_id', 'set_updated_at', 'check_fiscal_period_overlap', '_assert_inventory_pin_format',
  'generate_contact_code', 'set_transaction_posted', 'check_lease_contract_overlap', 'payroll_month_end', 'auto_allocate_tenant_rent_payment'];

// ── 1. the defects, reproduced on the baseline ──────────────────────────────
{
  await su();
  const periodsBefore = n(await val(`SELECT count(*) FROM fiscal_periods`));
  await as('viewer');
  const p = await attempt(() => val(`SELECT assert_fiscal_period_open('2099-05-10')`));
  await su();
  check('baseline', 'DEFECT: a viewer can create a fiscal period through assert_fiscal_period_open',
    p.ok && n(await val(`SELECT count(*) FROM fiscal_periods`)) === periodsBefore + 1, p.error ?? '');
  await as('viewer');
  const g1 = await attempt(() => val(`SELECT generate_journal_reference('2031-03-01')`));
  const g2 = await attempt(() => val(`SELECT generate_journal_reference('2031-03-01')`));
  check('baseline', 'DEFECT: a viewer can burn journal reference numbers through generate_journal_reference', g1.ok && g2.ok && g1.value !== g2.value, `${g1.value} ${g2.value}`);
  await su();
  check('baseline', 'DEFECT: 3 functions are executable by anon through PUBLIC',
    n(await val(`SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE')`)) >= 3);
  check('baseline', 'DEFECT: trigger functions are executable by authenticated',
    (await callable('authenticated', 'public.audit_transaction_changes()')) === true);
  check('baseline', 'DEFECT: 9 functions have no pinned search_path',
    n(await val(`SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1::text[]) AND p.proconfig IS NULL`, [`{${PURE_FNS.join(',')}}`])) === 9);
  await as('cashier');
  const forged = await val(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, created_by)
    VALUES ('REVENUE', 'POSTED', 'CASH', 40, 'LYD', '2026-03-04', 'forged author', $1, $2, $3) RETURNING id`, [REV, CASH, U.owner]);
  await su();
  check('baseline', 'DEFECT: a cashier can write a transaction in the owner\'s name (and the journal keeps it)',
    (await val(`SELECT created_by FROM transactions WHERE id = $1`, [forged])) === U.owner
    && (await val(`SELECT created_by_user_id FROM journal_entries WHERE source_type = 'TRANSACTION' AND source_id = $1`, [forged])) === U.owner);
  await db.query(`UPDATE journal_entries SET status = 'REVERSED' WHERE source_type = 'TRANSACTION' AND source_id = $1`, [forged]);
  await as('accountant');
  const bf = await attempt(() => val(`SELECT backfill_existing_transactions_to_ledger()`));
  await su();
  check('baseline', 'DEFECT: backfill_existing_transactions_to_ledger reports success but posts nothing',
    bf.ok && /1/.test(bf.value) && n(await val(`SELECT count(*) FROM journal_entries WHERE source_type = 'TRANSACTION' AND source_id = $1 AND status = 'POSTED'`, [forged])) === 0, bf.value ?? bf.error);
  await db.query(`DELETE FROM transactions WHERE id = $1`, [forged]);
  await as('cashier');
  const pin1 = await attempt(() => val(`SELECT set_cashbox_inventory_pin('1234')`));
  await as('owner');
  const pin2 = await attempt(() => val(`SELECT set_cashbox_inventory_pin('9999')`));
  check('baseline', 'DEFECT: a cashier sets the inventory PIN first and the owner cannot take it back', pin1.ok && !pin2.ok, pin2.error ?? '');
  await su();
  await db.query(`DELETE FROM app_secrets`);
}

// ── 2. apply 085, twice ─────────────────────────────────────────────────────
await su();
const ok1 = await run('apply 085', read('085_function_hardening.sql'));
const afterFirst = ok1 ? await snapshot() : null;
const ok2 = ok1 && (await run('apply 085 again over itself', read('085_function_hardening.sql')));
const afterSecond = ok2 ? await snapshot() : null;
check('apply', '085 applies', ok1);
check('apply', '085 applies again over itself and changes nothing', ok2 && sameSnapshot(afterFirst, afterSecond).length === 0, ok2 ? sameSnapshot(afterFirst, afterSecond).join('; ') : '');
if (!ok1) { for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.area}] ${r.name}${r.ok || !r.detail ? '' : `\n          ${r.detail}`}`); process.exit(1); }

// ── 3. grants ───────────────────────────────────────────────────────────────
await su();
{
  const exposedTriggers = await rows(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype = 'trigger'::regtype
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))`);
  check('grants', 'no trigger function in public is executable by authenticated or anon', exposedTriggers.length === 0, exposedTriggers.map((r) => r.proname).join(', '));
  const stillPublic = await rows(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
    AND has_function_privilege('anon', p.oid, 'EXECUTE')`);
  check('grants', 'anon can execute no function in public (PUBLIC grants swept)', stillPublic.length === 0, stillPublic.map((r) => r.proname).join(', '));
  const publicAcl = await rows(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
    AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')`);
  check('grants', 'no function in public carries a PUBLIC execute grant', publicAcl.length === 0, publicAcl.map((r) => r.proname).join(', '));
  const named = [];
  for (const f of TRIGGER_FNS) {
    const sigs = await rows(`SELECT p.oid::regprocedure::text s FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = $1`, [f]);
    if (sigs.length === 0) continue;
    for (const { s } of sigs) if ((await callable('authenticated', s)) || (await callable('anon', s))) named.push(s);
  }
  check('grants', 'all 21 audited trigger functions are closed to authenticated and anon', named.length === 0, named.join(', '));
  for (const sig of ['public.assert_fiscal_period_open(date)', 'public.generate_journal_reference(date)', 'public.generate_cash_transfer_reference(date)', 'public._assert_inventory_pin_format(text)']) {
    check('grants', `${sig} is not callable through the API`, (await callable('authenticated', sig)) === false && (await callable('anon', sig)) === false);
  }
  for (const sig of ['public.auth_role_may_write()', 'public.auth_may_manage_journals()', 'public.auth_may_manage_accounts()', 'public.auth_can_manage_org()',
    'public.auth_is_viewer()', 'public.get_my_role()', 'public.user_has_audit_access()']) {
    check('grants', `${sig} stays executable by authenticated (RLS policies call it)`, (await callable('authenticated', sig)) === true);
  }
  check('grants', 'service_role keeps execute on the revoked functions', (await callable('service_role', 'public.assert_fiscal_period_open(date)')) === true);
  check('grants', 'app_secrets: authenticated has no table privilege', (await val(`SELECT has_table_privilege('authenticated', 'public.app_secrets', 'SELECT')`)) === false
    && (await val(`SELECT has_table_privilege('authenticated', 'public.app_secrets', 'INSERT')`)) === false);
  await db.exec(`CREATE FUNCTION public.zz_probe_default_acl() RETURNS int LANGUAGE sql AS 'SELECT 1'`);
  check('grants', 'a function created from now on is not executable by PUBLIC or anon',
    (await callable('anon', 'public.zz_probe_default_acl()')) === false
    && n(await val(`SELECT count(*) FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.proname = 'zz_probe_default_acl' AND a.grantee = 0`)) === 0);
  await db.exec(`DROP FUNCTION public.zz_probe_default_acl()`);

  // every RPC the app calls from src/ is still executable by authenticated
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
  const used = new Set();
  for (const f of walk('src')) for (const m of readFileSync(f, 'utf8').matchAll(/\.rpc\(\s*['"`]([a-z_0-9]+)['"`]/g)) used.add(m[1]);
  for (const m of readFileSync('src/lib/db/queries.ts', 'utf8').matchAll(/"create_contact"/g)) used.add('create_contact');
  const existing = new Set((await rows(`SELECT DISTINCT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace`)).map((r) => r.proname));
  const missing = [];
  for (const name of used) {
    if (!existing.has(name)) continue;
    const ok = await val(`SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = $1`, [name]);
    if (!ok) missing.push(name);
  }
  check('grants', `all ${[...used].filter((x) => existing.has(x)).length} RPCs the app calls are still executable by authenticated`, missing.length === 0, missing.join(', '));
}

// ── 4. search_path ──────────────────────────────────────────────────────────
{
  const unpinned = await rows(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1::text[])
    AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))`, [`{${PURE_FNS.join(',')}}`]);
  check('search_path', 'the 9 flagged functions have a pinned search_path', unpinned.length === 0, unpinned.map((r) => r.proname).join(', '));
  const secdefUnpinned = await rows(`SELECT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))`);
  check('search_path', 'every SECURITY DEFINER function in public has a pinned search_path', secdefUnpinned.length === 0, secdefUnpinned.map((r) => r.proname).join(', '));
  check('search_path', 'pure helpers still compute', (await val(`SELECT payroll_month_end('2026-02')`)) === '2026-02-28'
    && /^[0-9a-f-]{36}$/.test(await val(`SELECT year_close_source_id(2026)`))
    && (await attempt(() => val(`SELECT _assert_inventory_pin_format('12')`))).ok === false
    && (await attempt(() => val(`SELECT _assert_inventory_pin_format('1234')`))).ok === true);
}

// ── 5. the two writers are closed, with and without the grant ───────────────
{
  await as('viewer');
  const periodsBefore = n(await val(`SELECT count(*) FROM fiscal_periods`));
  const seqBefore = (await rows(`SELECT year, last_value FROM journal_reference_sequences ORDER BY year`)).map((r) => `${r.year}:${r.last_value}`).join(',');
  const a = await attempt(() => val(`SELECT assert_fiscal_period_open('2098-01-10')`));
  const b = await attempt(() => val(`SELECT generate_journal_reference('2030-01-01')`));
  await su();
  check('closed', 'a viewer can no longer call assert_fiscal_period_open or generate_journal_reference through the API',
    !a.ok && !b.ok && n(await val(`SELECT count(*) FROM fiscal_periods`)) === periodsBefore
    && (await rows(`SELECT year, last_value FROM journal_reference_sequences ORDER BY year`)).map((r) => `${r.year}:${r.last_value}`).join(',') === seqBefore, `${a.error} | ${b.error}`);

  // someone re-runs a blanket GRANT (078 does): the bodies must still refuse
  await su();
  await db.exec(`GRANT EXECUTE ON FUNCTION public.assert_fiscal_period_open(date), public.generate_journal_reference(date) TO authenticated, anon`);
  await as('viewer');
  const va = await attempt(() => val(`SELECT assert_fiscal_period_open('2098-02-10')`));
  const vb = await attempt(() => val(`SELECT generate_journal_reference('2030-01-01')`));
  check('closed', 'even with EXECUTE re-granted, a viewer is refused inside the body', denied(va) && denied(vb), `${va.error} | ${vb.error}`);
  await as('cashier');
  const ca = await attempt(() => val(`SELECT assert_fiscal_period_open('2026-03-10')`));
  const cb = await attempt(() => val(`SELECT generate_journal_reference('2030-01-01')`));
  check('closed', 'with EXECUTE re-granted a cashier may open a period (posting needs it) but not number journals', ca.ok && denied(cb), `${ca.error} | ${cb.error}`);
  await as('accountant');
  check('closed', 'with EXECUTE re-granted an accountant may number journals', (await attempt(() => val(`SELECT generate_journal_reference('2030-01-01')`))).ok);
  await actAs(db, 'anon');
  const an = await attempt(() => val(`SELECT assert_fiscal_period_open('2098-03-10')`));
  check('closed', 'with EXECUTE re-granted anon is refused inside the body', denied(an), an.error ?? '');
  await asService();
  check('closed', 'service_role passes both', (await attempt(() => val(`SELECT assert_fiscal_period_open('2098-04-10')`))).ok && (await attempt(() => val(`SELECT generate_journal_reference('2030-01-01')`))).ok);
  await su();
  check('closed', 'a direct database connection (no JWT) passes both', (await attempt(() => val(`SELECT assert_fiscal_period_open('2098-05-10')`))).ok && (await attempt(() => val(`SELECT generate_journal_reference('2030-01-01')`))).ok);
  await db.exec(`REVOKE ALL ON FUNCTION public.assert_fiscal_period_open(date), public.generate_journal_reference(date) FROM authenticated, anon`);
}

// ── 6. the role gate on the whole write surface (viewer and cashier) ────────
{
  const ID = '99999999-9999-4999-8999-999999999999';
  await as('accountant');
  const JID = await val(`SELECT create_journal_entry(NULL, '2026-03-01', 'مسودة للفحص', NULL,
    jsonb_build_array(jsonb_build_object('category_id', '${EXP}', 'debit', 5, 'credit', 0),
                      jsonb_build_object('category_id', '${cat['AST-CSH']}', 'debit', 0, 'credit', 5, 'cashbox_id', '${CASH}')))`);
  const writes = [
    [`SELECT create_journal_entry(NULL, '2026-03-01', 'x', NULL, '[]'::jsonb)`, 'manage'],
    [`SELECT update_journal_entry('${ID}', NULL, '2026-03-01', 'x', NULL, '[]'::jsonb)`, 'manage'],
    [`SELECT post_journal_entry('${ID}')`, 'manage'],
    [`SELECT reverse_journal_entry('${ID}')`, 'manage'],
    [`SELECT duplicate_journal_entry('${JID}')`, 'manage'],
    [`SELECT close_fiscal_year(2020)`, 'manage'],
    [`SELECT backfill_existing_transactions_to_ledger()`, 'manage'],
    [`SELECT * FROM rent_missing_charges('2026-03')`, 'manage'],
    [`SELECT ensure_tenant_portal_token('${ID}')`, 'manage'],
    [`SELECT get_audit_log_feed()`, 'org'],
    [`SELECT payroll_prepare_run('2030-01')`, 'manage'],
    [`SELECT payroll_set_salary('${ID}', '2030-01-01', 100, 0, 0, 0, NULL)`, 'manage'],
    [`SELECT payroll_add_adjustment('${ID}', '2030-01', 'BONUS', 10, 'سبب كافٍ')`, 'manage'],
    [`SELECT payroll_issue_advance('${ID}', 10, 1, '${CASH}', '2030-01-01', 'سبب كافٍ')`, 'manage'],
    [`SELECT payroll_approve_run('${ID}')`, 'org'],
    [`SELECT payroll_post_run('${ID}')`, 'manage'],
    [`SELECT payroll_reverse_run('${ID}', 'سبب كافٍ')`, 'org'],
    [`SELECT payroll_decide_adjustment('${ID}', true)`, 'org'],
    [`SELECT payroll_cancel_advance('${ID}', 'سبب كافٍ')`, 'org'],
    [`SELECT decide_voucher_approval('${ID}', true)`, 'manage'],
  ];
  const writeLevel = [
    [`SELECT create_contact('{"name":"x"}'::jsonb)`],
    [`SELECT generate_monthly_charges('2030-05')`],
    [`SELECT record_rent_payment('${T1}', 10, '2030-05-01', '${CASH}', NULL, '{2030-05}', 'CASH')`],
    [`SELECT record_cashbox_transfer('${CASH}', '${BANK}', 1, '2030-05-01', NULL, NULL)`],
    [`SELECT apply_charge_allocations('${ID}', '[]'::jsonb)`],
    [`SELECT apply_cashbox_inventory('1234', '[]'::jsonb)`],
    [`SELECT set_cashbox_inventory_pin('1234')`],
    [`SELECT set_ledger_event_reconciled('transaction', '${ID}', true)`],
    [`SELECT sync_overdue_charge_notifications()`],
    [`SELECT ensure_tenant_rent_charges('${T1}', '{2030-05}')`],
    [`SELECT set_tenant_rent_month_status('${T1}', '{2030-05}', true, '${ID}', 1)`],
    [`SELECT set_tenant_rent_exempt_months('${T1}', '{2030-05}', true, NULL)`],
    [`SELECT set_tenant_rent_price_bands('${T1}', '[]'::jsonb)`],
    [`SELECT ensure_tenant_lease_contract('${T1}')`],
    [`SELECT submit_voucher_for_approval('${ID}')`],
    [`SELECT delete_disbursement_voucher('${ID}')`],
    [`SELECT payroll_pay_line('${ID}', 1, '${CASH}', '2030-05-01', 'CASH')`],
    [`SELECT sync_rent_charges_to_schedule('${T1}')`],
  ];
  const leaked = { viewer: [], cashier: [] };
  for (const who of ['viewer', 'cashier']) {
    await as(who);
    for (const [sql, level] of writes) {
      const r = await attempt(() => rows(sql));
      if (!denied(r)) leaked[who].push(`${sql.slice(7, 45)} → ${r.ok ? 'ALLOWED' : r.error?.slice(0, 50)}`);
    }
  }
  check('surface', 'viewer and cashier are refused by every journal, year-close, ledger, portal-token, audit and payroll-management RPC', leaked.viewer.length === 0 && leaked.cashier.length === 0,
    `viewer: ${leaked.viewer.join(' ; ')} | cashier: ${leaked.cashier.join(' ; ')}`);
  await as('viewer');
  const viewerLeak = [];
  for (const [sql] of writeLevel) {
    const r = await attempt(() => rows(sql));
    if (!denied(r)) viewerLeak.push(`${sql.slice(7, 45)} → ${r.ok ? 'ALLOWED' : r.error?.slice(0, 50)}`);
  }
  check('surface', 'a viewer is refused by every operational write RPC', viewerLeak.length === 0, viewerLeak.join(' ; '));
  await actAs(db, 'anon');
  const anonLeak = [];
  for (const [sql] of [...writes.map((w) => [w[0]]), ...writeLevel, [`SELECT get_my_role()`], [`SELECT get_trial_balance(2026)`], [`SELECT cashbox_inventory_pin_is_set()`]]) {
    const r = await attempt(() => rows(sql));
    if (r.ok) anonLeak.push(sql.slice(7, 45));
  }
  check('surface', 'anon is refused by every RPC', anonLeak.length === 0, anonLeak.join(' ; '));
  await as('accountant');
  const accAudit = await attempt(() => val(`SELECT get_audit_log_feed()`));
  await as('admin');
  const admAudit = await attempt(() => val(`SELECT get_audit_log_feed()`));
  await as('owner');
  const ownAudit = await attempt(() => val(`SELECT get_audit_log_feed()`));
  check('surface', 'the audit log feed is for owner and admin only', denied(accAudit) && admAudit.ok && ownAudit.ok, `${accAudit.error ?? 'accountant allowed'} | ${admAudit.error ?? ''} | ${ownAudit.error ?? ''}`);
  await as('accountant');
  const accPortal = await attempt(() => val(`SELECT ensure_tenant_portal_token($1)`, [T1]));
  await as('cashier');
  const cashPortal = await attempt(() => val(`SELECT ensure_tenant_portal_token($1)`, [T1]));
  check('surface', 'the tenant portal token is for owner, admin and accountant only', accPortal.ok && typeof accPortal.value === 'string' && accPortal.value.length >= 32 && denied(cashPortal), `${accPortal.error ?? ''} | ${cashPortal.error ?? 'cashier allowed'}`);
}

// ── 7. every allowed role still does its job (trigger functions fire without EXECUTE) ──
let journalRef;
{
  await as('accountant');
  const created = await attempt(() => val(`SELECT create_journal_entry(NULL, '2026-03-02', 'قيد اختبار', NULL,
    jsonb_build_array(jsonb_build_object('category_id', '${EXP}', 'debit', 25, 'credit', 0),
                      jsonb_build_object('category_id', '${cat['AST-CSH']}', 'debit', 0, 'credit', 25, 'cashbox_id', '${CASH}')))`));
  check('flows', 'accountant: create_journal_entry numbers the entry itself', created.ok, created.error ?? '');
  journalRef = created.value;
  await su();
  check('flows', 'the generated reference follows the JY-year-sequence format', /^JY-2026-\d{5}$/.test(await val(`SELECT reference FROM journal_entries WHERE id = $1`, [journalRef]) ?? ''));
  await as('accountant');
  const posted = await attempt(() => val(`SELECT post_journal_entry($1)`, [journalRef]));
  const peek = await attempt(() => val(`SELECT peek_next_journal_reference('2026-03-02')`));
  const dup = await attempt(() => val(`SELECT duplicate_journal_entry($1)`, [journalRef]));
  const rev = await attempt(() => val(`SELECT reverse_journal_entry($1)`, [journalRef]));
  check('flows', 'accountant: post, peek the next reference, duplicate and reverse a journal', posted.ok && peek.ok && dup.ok && rev.ok, [posted, peek, dup, rev].map((x) => x.error).filter(Boolean).join(' | '));
  await su();
  check('flows', 'the audit trigger wrote a line for the posted journal (audit_journal_entry_changes fires)', n(await val(`SELECT count(*) FROM audit_log WHERE entity_type = 'journal_entry' AND entity_id = $1`, [journalRef])) >= 1);

  await as('cashier');
  const tx = await attempt(() => one(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, contact_id, created_by, auto_allocate_charges)
    VALUES ('REVENUE', 'POSTED', 'CASH', 120, 'LYD', '2026-03-05', 'إيراد', $1, $2, $3, $4, true) RETURNING id`, [REV, CASH, C1, U.cashier]));
  check('flows', 'cashier: a transaction posts its journal (process_transaction_posting, audit_transaction_changes fire)', tx.ok
    && n(await val(`SELECT count(*) FROM journal_entries WHERE source_type = 'TRANSACTION' AND source_id = $1 AND status = 'POSTED'`, [tx.value?.id])) === 1, tx.error ?? '');
  const badKind = await attempt(() => db.query(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id)
    VALUES ('REVENUE', 'POSTED', 'CASH', 5, 'LYD', '2026-03-05', 'x', $1, $2)`, [EXP, CASH]));
  check('flows', 'check_transaction_category_kind still rejects a revenue booked on an expense account', !badKind.ok && /البند المحاسبي/.test(badKind.error ?? ''), badKind.error ?? '');
  const rent = await attempt(() => val(`SELECT record_rent_payment($1, 1000, '2026-03-06', $2, NULL, '{2026-03}', 'CASH')`, [T1, CASH]));
  check('flows', 'cashier: record_rent_payment (posting, rent links, charge accrual)', rent.ok, rent.error ?? '');
  const xfer = await attempt(() => val(`SELECT record_cashbox_transfer($1, $2, 50, '2026-03-07', NULL, NULL)`, [CASH, BANK]));
  check('flows', 'cashier: record_cashbox_transfer (generate_cash_transfer_reference runs inside)', xfer.ok && /^TR-2026-/.test(xfer.value?.reference ?? ''), xfer.error ?? '');
  const own = await attempt(() => db.query(`UPDATE profiles SET full_name_ar = 'اسم جديد' WHERE id = $1`, [U.cashier]));
  const esc = await attempt(() => db.query(`UPDATE profiles SET role = 'owner' WHERE id = $1`, [U.cashier]));
  check('flows', 'a user edits their own profile but not their role (prevent_role_self_escalation fires)', own.ok && !esc.ok, esc.error ?? '');

  await as('owner');
  const gen = await attempt(() => val(`SELECT generate_monthly_charges('2026-04')`));
  check('flows', 'owner: generate_monthly_charges (charge posting trigger, accrual)', gen.ok && n(gen.value?.created) >= 1, gen.error ?? '');
  const closed = await attempt(() => val(`SELECT preview_fiscal_year_close(2026)`));
  check('flows', 'owner: preview_fiscal_year_close', closed.ok, closed.error ?? '');
  const upd = await attempt(() => db.query(`UPDATE cashboxes SET name_ar = name_ar || ' ' WHERE id = $1`, [CASH]));
  check('flows', 'updates fire set_updated_at and audit_cashbox_changes', upd.ok, upd.error ?? '');
  const overlap = await attempt(() => db.query(`INSERT INTO fiscal_periods (name, start_date, end_date, is_closed) VALUES ('x', '2026-03-10', '2026-03-20', false)`));
  check('flows', 'check_fiscal_period_overlap still rejects an overlapping period', !overlap.ok && /تتداخل/.test(overlap.error ?? ''), overlap.error ?? '');
  const delContact = await attempt(() => db.query(`DELETE FROM contacts WHERE id = $1`, [C1]));
  check('flows', 'prevent_contact_delete_with_history still refuses to delete a contact with history', !delContact.ok, delContact.error ?? '');
  const code = await val(`SELECT code FROM contacts WHERE id = $1`, [C1]);
  check('flows', 'generate_contact_code still fills the contact code', typeof code === 'string' && code.length >= 5, code);
}

// ── 8. new accounts start as viewer, even with the guard trigger off ────────
{
  await su();
  await db.exec(`DO $$ BEGIN CREATE ROLE zz_auth_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    GRANT USAGE ON SCHEMA auth TO zz_auth_admin; GRANT SELECT, INSERT ON auth.users TO zz_auth_admin;`);
  const NEW1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const NEW2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  await actAs(db, 'superuser');
  await db.exec('SET ROLE zz_auth_admin');
  const ins = await attempt(() => db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, 'new1@test.local', '{"full_name":"جديد"}')`, [NEW1]));
  await su();
  check('signup', 'a new auth user gets a profile although the signup role has no EXECUTE on handle_new_user', ins.ok && (await val(`SELECT role FROM profiles WHERE id = $1`, [NEW1])) === 'viewer', ins.error ?? '');
  await db.exec(`ALTER TABLE profiles DISABLE TRIGGER trg_prevent_role_self_escalation`);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'new2@test.local')`, [NEW2]);
  const role2 = await val(`SELECT role FROM profiles WHERE id = $1`, [NEW2]);
  await db.exec(`ALTER TABLE profiles ENABLE TRIGGER trg_prevent_role_self_escalation`);
  check('signup', 'handle_new_user itself writes viewer (no dependence on the guard trigger)', role2 === 'viewer', role2);
  await db.exec('RESET ROLE');
}

// ── 9. inventory PIN ────────────────────────────────────────────────────────
{
  await su();
  await db.query(`DELETE FROM app_secrets`);
  await as('viewer');
  check('pin', 'a viewer cannot set the PIN', denied(await attempt(() => val(`SELECT set_cashbox_inventory_pin('1234')`))));
  await as('cashier');
  const first = await attempt(() => val(`SELECT set_cashbox_inventory_pin('1234')`));
  check('pin', 'the first PIN can be set by any account that writes (the screen allows the cashier)', first.ok, first.error ?? '');
  const cashierNoCurrent = await attempt(() => val(`SELECT set_cashbox_inventory_pin('1111')`));
  const cashierWrong = await attempt(() => val(`SELECT set_cashbox_inventory_pin('1111', '0000')`));
  check('pin', 'changing needs the current PIN for a cashier', !cashierNoCurrent.ok && !cashierWrong.ok);
  check('pin', 'a cashier with the current PIN can change it', (await attempt(() => val(`SELECT set_cashbox_inventory_pin('4321', '1234')`))).ok);
  await as('accountant');
  check('pin', 'an accountant also needs the current PIN', !(await attempt(() => val(`SELECT set_cashbox_inventory_pin('2222')`))).ok);
  await as('admin');
  check('pin', 'an admin resets the PIN without the current one (recovery)', (await attempt(() => val(`SELECT set_cashbox_inventory_pin('5555')`))).ok);
  await as('owner');
  check('pin', 'the owner resets the PIN without the current one (recovery)', (await attempt(() => val(`SELECT set_cashbox_inventory_pin('6666')`))).ok);
  check('pin', 'a malformed new PIN is still refused for the owner', !(await attempt(() => val(`SELECT set_cashbox_inventory_pin('12')`))).ok);
  await as('cashier');
  const read = await attempt(() => rows(`SELECT hash FROM app_secrets`));
  check('pin', 'no signed-in account can read the PIN hash from app_secrets', !read.ok, read.error ?? '');
  check('pin', 'cashbox_inventory_pin_is_set still answers true/false', (await val(`SELECT cashbox_inventory_pin_is_set()`)) === true);
  await su();
  check('pin', 'the stored value is a bcrypt hash, not the PIN', /^\$2[aby]\$08\$/.test(await val(`SELECT hash FROM app_secrets WHERE key = 'cashbox_inventory_pin'`)));
  await as('cashier');
  const wrong = await attempt(() => val(`SELECT apply_cashbox_inventory('1234', $1::jsonb)`, [JSON.stringify([{ cashbox_id: CASH, counted: 0 }])]));
  const right = await attempt(() => val(`SELECT apply_cashbox_inventory('6666', $1::jsonb)`, [JSON.stringify([{ cashbox_id: CASH, counted: 10 }, { cashbox_id: BANK, counted: 0 }])]));
  check('pin', 'a count with the wrong PIN is refused and one with the right PIN posts', !wrong.ok && right.ok && n(right.value?.adjusted) >= 1, `${wrong.error} | ${right.error ?? JSON.stringify(right.value)}`);
  await as('viewer');
  check('pin', 'a viewer cannot apply a count even with the right PIN', denied(await attempt(() => val(`SELECT apply_cashbox_inventory('6666', $1::jsonb)`, [JSON.stringify([{ cashbox_id: CASH, counted: 10 }])]))));
}

// ── 10. authorship ──────────────────────────────────────────────────────────
{
  await as('cashier');
  const tx = await val(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, created_by)
    VALUES ('REVENUE', 'POSTED', 'CASH', 33, 'LYD', '2026-03-08', 'authorship', $1, $2, $3) RETURNING id`, [REV, CASH, U.owner]);
  await su();
  check('author', 'a cashier\'s transaction is stamped with the cashier, not the id they sent',
    (await val(`SELECT created_by FROM transactions WHERE id = $1`, [tx])) === U.cashier
    && (await val(`SELECT created_by_user_id FROM journal_entries WHERE source_type = 'TRANSACTION' AND source_id = $1`, [tx])) === U.cashier);
  await as('cashier');
  await db.query(`UPDATE transactions SET created_by = $1, description = 'edited' WHERE id = $2`, [U.owner, tx]);
  await su();
  check('author', 'created_by cannot be rewritten later', (await val(`SELECT created_by FROM transactions WHERE id = $1`, [tx])) === U.cashier
    && (await val(`SELECT description FROM transactions WHERE id = $1`, [tx])) === 'edited');
  await as('cashier');
  const rp = await val(`SELECT record_rent_payment($1, 800, '2026-03-09', $2, NULL, '{2026-03}', 'CASH')`, [T2, CASH]);
  await su();
  check('author', 'a rent payment recorded through the RPC now carries its author', (await val(`SELECT created_by FROM transactions WHERE id = $1`, [rp.transaction_id])) === U.cashier);
  await asService();
  const svc = await val(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, created_by)
    VALUES ('REVENUE', 'POSTED', 'CASH', 7, 'LYD', '2026-03-10', 'server job', $1, $2, $3) RETURNING id`, [REV, CASH, U.accountant]);
  await su();
  check('author', 'service_role keeps the author it was given (server jobs, repairs)', (await val(`SELECT created_by FROM transactions WHERE id = $1`, [svc])) === U.accountant);
  const direct = await val(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, created_by)
    VALUES ('REVENUE', 'POSTED', 'CASH', 8, 'LYD', '2026-03-10', 'direct', $1, $2, $3) RETURNING id`, [REV, CASH, U.admin]);
  check('author', 'a direct database connection keeps the author it was given', (await val(`SELECT created_by FROM transactions WHERE id = $1`, [direct])) === U.admin);

  // vouchers: approver and submitter are always the caller
  await as('cashier');
  const forgedDraft = await attempt(() => db.query(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, method, total_amount, created_by, approved_by, cashbox_id, category_id)
    VALUES ('H-001', '2026-03-12', 'مورد', 'CASH', 90, $1, $2, $3, $4)`, [U.cashier, U.owner, CASH, EXP]));
  check('author', 'a voucher cannot be created with someone else as approver', !forgedDraft.ok, forgedDraft.error ?? '');
  const vid = await val(`INSERT INTO disbursement_vouchers (voucher_number, voucher_date, payee, method, total_amount, created_by, cashbox_id, category_id)
    VALUES ('H-002', '2026-03-12', 'مورد', 'CASH', 90, $1, $2, $3) RETURNING id`, [U.cashier, CASH, EXP]);
  await db.query(`INSERT INTO disbursement_voucher_lines (voucher_id, sort_order, description, amount) VALUES ($1, 0, 'بند', 90)`, [vid]);
  const forgedSubmit = await attempt(() => db.query(`UPDATE disbursement_vouchers SET submitted_by = $2 WHERE id = $1`, [vid, U.owner]));
  check('author', 'a voucher cannot be marked as submitted by someone else', !forgedSubmit.ok, forgedSubmit.error ?? '');
  await val(`SELECT submit_voucher_for_approval($1)`, [vid]);
  await as('accountant');
  const forgedApprove = await attempt(() => db.query(`UPDATE disbursement_vouchers SET approved_by = $2 WHERE id = $1`, [vid, U.owner]));
  check('author', 'an accountant cannot write the owner as approver by editing the table', !forgedApprove.ok, forgedApprove.error ?? '');
  const decide = await attempt(() => val(`SELECT decide_voucher_approval($1, true, NULL)`, [vid]));
  await su();
  check('author', 'the approval RPC records the real approver and posts the voucher', decide.ok
    && (await val(`SELECT approved_by FROM disbursement_vouchers WHERE id = $1`, [vid])) === U.accountant
    && (await val(`SELECT submitted_by FROM disbursement_vouchers WHERE id = $1`, [vid])) === U.cashier
    && n(await val(`SELECT count(*) FROM journal_entries WHERE source_type = 'VOUCHER' AND source_id = $1 AND status = 'POSTED'`, [vid])) === 1, decide.error ?? '');
}

// ── 11. ledger backfill does its job now ────────────────────────────────────
{
  await su();
  const mk = async (date, amount) => val(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id)
    VALUES ('REVENUE', 'POSTED', 'CASH', $2, 'LYD', $1::date, 'backfill', $3, $4) RETURNING id`, [date, amount, REV, CASH]);
  const open1 = await mk('2026-03-15', 11);
  const open2 = await mk('2026-03-16', 12);
  const closedTx = await mk('2025-12-15', 13);
  await db.query(`UPDATE journal_entries SET status = 'REVERSED' WHERE source_type = 'TRANSACTION' AND source_id = ANY($1::uuid[])`, [`{${[open1, open2, closedTx].join(',')}}`]);
  await val(`SELECT assert_fiscal_period_open('2025-12-15')`);
  await db.query(`UPDATE fiscal_periods SET is_closed = true, closed_at = now() WHERE '2025-12-15' BETWEEN start_date AND end_date`);
  const cashBefore = n(await val(`SELECT get_cashbox_balance($1)`, [CASH]));
  await as('viewer');
  check('backfill', 'a viewer cannot run the backfill', denied(await attempt(() => val(`SELECT backfill_existing_transactions_to_ledger()`))));
  await as('cashier');
  check('backfill', 'a cashier cannot run the backfill', denied(await attempt(() => val(`SELECT backfill_existing_transactions_to_ledger()`))));
  await as('accountant');
  const bf = await attempt(() => val(`SELECT backfill_existing_transactions_to_ledger()`));
  await su();
  const posted = async (id) => n(await val(`SELECT count(*) FROM journal_entries WHERE source_type = 'TRANSACTION' AND source_id = $1 AND status = 'POSTED'`, [id]));
  check('backfill', 'the two open-period transactions are posted again, one journal each', bf.ok && (await posted(open1)) === 1 && (await posted(open2)) === 1, bf.value ?? bf.error);
  check('backfill', 'the one in a closed period is skipped, left as it was, and the message says so', (await posted(closedTx)) === 0
    && (await val(`SELECT status FROM transactions WHERE id = $1`, [closedTx])) === 'POSTED' && /تعذ.ر ترحيل 1/.test(bf.value ?? ''), bf.value ?? '');
  check('backfill', 'the cashbox balance moved by exactly the two re-posted amounts', near(n(await val(`SELECT get_cashbox_balance($1)`, [CASH])) - cashBefore, 23));
  await as('accountant');
  const again = await attempt(() => val(`SELECT backfill_existing_transactions_to_ledger()`));
  check('backfill', 'running it again posts nothing twice', again.ok && /عدد 0/.test(again.value ?? '') && (await posted(open1)) === 1, again.value ?? again.error);
}

// ── 12. charge allocations ──────────────────────────────────────────────────
{
  await su();
  const lease = await val(`SELECT id FROM lease_contracts WHERE tenant_id = $1 LIMIT 1`, [T1]);
  const chargeRow = await val(`INSERT INTO tenant_charges (contract_id, amount, due_date, type, description, status, total_paid)
    VALUES ($1, 200, '2026-06-01', 'SERVICE', 'خدمة', 'UNPAID', 0) RETURNING id`, [lease]);
  const pay = await val(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, contact_id, auto_allocate_charges)
    VALUES ('REVENUE', 'POSTED', 'CASH', 200, 'LYD', '2026-06-02', 'دفعة', $1, $2, $3, false) RETURNING id`, [cat['REV-SRV'] ?? REV, CASH, T1]);
  const expense = await val(`INSERT INTO transactions (kind, status, method, amount, currency, tx_date, description, category_id, cashbox_id, contact_id, auto_allocate_charges)
    VALUES ('EXPENSE', 'POSTED', 'CASH', 200, 'LYD', '2026-06-02', 'استرجاع', $1, $2, $3, false) RETURNING id`, [EXP, CASH, T1]);
  await as('cashier');
  const alloc = JSON.stringify([{ charge_id: chargeRow, amount: 200 }]);
  const asExpense = await attempt(() => val(`SELECT apply_charge_allocations($1, $2::jsonb)`, [expense, alloc]));
  check('alloc', 'an expense transaction cannot be allocated to rent charges', !asExpense.ok && /الإيرادات/.test(asExpense.error ?? ''), asExpense.error ?? '');
  const first = await attempt(() => val(`SELECT apply_charge_allocations($1, $2::jsonb)`, [pay, alloc]));
  const second = await attempt(() => val(`SELECT apply_charge_allocations($1, $2::jsonb)`, [pay, alloc]));
  await su();
  check('alloc', 'a payment allocates once and a second call is refused', first.ok && !second.ok
    && near(await val(`SELECT total_paid FROM tenant_charges WHERE id = $1`, [chargeRow]), 200)
    && n(await val(`SELECT count(*) FROM tenant_charge_allocations WHERE transaction_id = $1`, [pay])) === 1, `${first.error} | ${second.error}`);
  await as('viewer');
  check('alloc', 'a viewer cannot allocate', denied(await attempt(() => val(`SELECT apply_charge_allocations($1, $2::jsonb)`, [pay, alloc]))));
}

// ── 13. 083 and 084 untouched (only when applied) ───────────────────────────
if (with083) {
  await su();
  const leaveApi = ['employee_leave_request', 'employee_leave_decide', 'employee_leave_cancel', 'employee_leave_end_early', 'employee_leave_balance', 'employees_on_leave', 'employee_details_upsert'];
  const ok = await val(`SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY($1::text[])`, [`{${leaveApi.join(',')}}`]);
  const helpersClosed = await val(`SELECT bool_and(NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'leave\\_%'`);
  check('083', '083 leave RPCs stay executable and its helpers stay closed', ok === true && helpersClosed === true);
  await as('viewer');
  check('083', 'a viewer is refused by the leave RPCs', denied(await attempt(() => val(`SELECT employee_leave_balance('99999999-9999-4999-8999-999999999999')`))));
}

// ── 14. rollback restores the baseline exactly, then 085 applies again ──────
{
  await su();
  const rolled = await run('roll back 085', read('085_function_hardening.ROLLBACK.sql'));
  const afterRollback = rolled ? await snapshot() : null;
  const diff = rolled ? sameSnapshot(baseline, afterRollback) : ['rollback failed'];
  check('rollback', 'rolling back 085 returns functions, grants, comments, triggers, app_secrets and default privileges to the baseline', rolled && diff.length === 0, diff.join('\n          '));
  if (rolled) {
    await as('viewer');
    check('rollback', 'after the rollback the baseline behaviour is back (a viewer reaches assert_fiscal_period_open again)', (await attempt(() => val(`SELECT assert_fiscal_period_open('2097-01-10')`))).ok);
  }
  await su();
  const again = await run('apply 085 after a rollback', read('085_function_hardening.sql'));
  const afterAgain = again ? await snapshot() : null;
  check('rollback', '085 applies cleanly after a rollback and lands on the same catalogue as the first time', again && sameSnapshot(afterFirst, afterAgain).length === 0, again ? sameSnapshot(afterFirst, afterAgain).join('; ') : '');
}

await db.close();
let lastArea = '';
for (const r of results) {
  if (r.area !== lastArea) { console.log(`\n[${r.area}]`); lastArea = r.area; }
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `\n          ${r.detail}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
