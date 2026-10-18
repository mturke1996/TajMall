/**
 * Proves the rollback files undo the proposed migrations, on an isolated PGlite replica.
 *   node scripts/test-migration-rollback.mjs
 *
 * Baseline = repository migrations + 078. Then 080 and 081 are applied and rolled back in reverse
 * order, and the schema (tables, columns, functions with their bodies, views, policies, grants,
 * triggers) must be identical to the baseline. 078's own rollback restores the production function
 * bodies, which differ from the repository's, so for 078 the check is that apply → rollback → apply
 * runs cleanly (the apply script relies on that).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createReplica } from './lib/pglite-replica.mjs';

const DIR = 'docs/proposed-migrations';
const read = (f) => readFileSync(`${DIR}/${f}`, 'utf8');
const { db } = await createReplica();
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const run = async (label, sql) => {
  try {
    await db.exec(sql);
    return true;
  } catch (error) {
    try { await db.exec('ROLLBACK'); } catch {}
    check(label, false, error.message);
    return false;
  }
};

async function schema() {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => JSON.stringify(r)).sort();
  const parts = {
    tables: await q(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public'`),
    functions: await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, md5(pg_get_functiondef(p.oid)) body
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'`),
    views: await q(`SELECT viewname, md5(definition) d FROM pg_views WHERE schemaname = 'public'`),
    policies: await q(`SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'`),
    grants: await q(`SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema = 'public'`),
    routineGrants: await q(`SELECT routine_name, grantee FROM information_schema.role_routine_grants WHERE routine_schema = 'public'`),
    triggers: await q(`SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers WHERE trigger_schema = 'public'`),
    constraints: await q(`SELECT conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d FROM pg_constraint WHERE connamespace = 'public'::regnamespace`),
    mappings: await q(`SELECT source_type FROM account_mappings`),
  };
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { hash: createHash('sha256').update(v.join('\n')).digest('hex'), rows: v }]));
}

function diff(a, b) {
  const out = [];
  for (const k of Object.keys(a)) {
    if (a[k].hash === b[k].hash) continue;
    const before = new Set(a[k].rows);
    const after = new Set(b[k].rows);
    const added = [...after].filter((r) => !before.has(r));
    const removed = [...before].filter((r) => !after.has(r));
    out.push(`${k}: +${added.length} −${removed.length} ${[...added, ...removed].slice(0, 3).join(' | ').slice(0, 300)}`);
  }
  return out;
}

if (await run('تطبيق 078', read('078_security_and_ledger_fixes.sql'))) {
  const baseline = await schema();
  const ok080 = await run('تطبيق 080', read('080_payroll.sql'));
  const ok081 = ok080 && (await run('تطبيق 081', read('081_rent_safety.sql')));
  if (ok081) {
    const rb081 = await run('تراجع 081', read('081_rent_safety.ROLLBACK.sql'));
    const rb080 = rb081 && (await run('تراجع 080', read('080_payroll.ROLLBACK.sql')));
    if (rb080) {
      const after = await schema();
      const d = diff(baseline, after).filter((line) => !line.startsWith('functions') || !line.includes('"proname"'));
      const dFn = diff(baseline, after);
      check('التراجع عن 081 ثم 080 يعيد المخطط كما كان بعد 078 تماماً', dFn.length === 0, dFn.join('\n          '));
      void d;
    }
  }
  check('078 يُطبَّق ثم يُتراجع عنه ثم يُطبَّق من جديد بلا أخطاء',
    (await run('تراجع 078', read('078_security_and_ledger_fixes.ROLLBACK.sql')))
      && (await run('إعادة تطبيق 078', read('078_security_and_ledger_fixes.sql'))));
  check('080 و081 يُطبَّقان من جديد بعد التراجع', (await run('إعادة 080', read('080_payroll.sql'))) && (await run('إعادة 081', read('081_rent_safety.sql'))));
}

await db.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `\n          ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
