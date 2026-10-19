/**
 * Replays the rent-charge defects found by the money audit on an isolated PGlite replica, before and after the
 * proposed migration 087, and proves its rollback restores the functions exactly.
 *
 *   node scripts/test-rent-charge-integrity.mjs
 *
 * Baseline = repository migrations + 078 + 081, which give the same ensure_tenant_rent_charges,
 * generate_monthly_charges and sync_rent_charges_to_schedule bodies as production today. The same scenarios run on
 * that baseline (each defect must reproduce, otherwise the scenario proves nothing) and on baseline + 087 (each must
 * be gone). Nothing here connects to Supabase. Exit code 1 on any failed check.
 */
import { readFileSync } from 'node:fs';
import { createReplica, actAs } from './lib/pglite-replica.mjs';

const DIR = 'docs/proposed-migrations';
const read = (f) => readFileSync(`${DIR}/${f}`, 'utf8');
const OWNER = '11111111-1111-4111-8111-111111111111';
const results = [];
const check = (area, name, ok, detail = '') => results.push({ area, name, ok: Boolean(ok), detail: String(detail) });
const pgArray = (items) => `{${items.join(',')}}`;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

async function replica({ with087 }) {
  const { db } = await createReplica();
  for (const f of ['078_security_and_ledger_fixes.sql', '081_rent_safety.sql']) await db.exec(read(f));
  if (with087) await db.exec(read('087_rent_charge_integrity.sql'));
  await actAs(db, 'superuser');
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local')`, [OWNER]);
  await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  await db.query(`INSERT INTO profiles (id, role) VALUES ($1, 'owner') ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`, [OWNER]);
  const rows = async (sql, p) => (await db.query(sql, p)).rows;
  const val = async (sql, p) => Object.values((await rows(sql, p))[0] ?? {})[0];
  const cash = (await rows(`SELECT id FROM cashboxes WHERE active AND kind = 'CASH' LIMIT 1`))[0].id;
  const as = (role) => actAs(db, role, role === 'superuser' ? null : OWNER);
  await as('authenticated');
  const tenant = async (name, rent, shop) => {
    const r = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify({ kind: 'TENANT', name, shop_number: shop, monthly_rent: rent })]);
    return r?.id ?? r?.contact?.id ?? r;
  };
  const lease = async (tenantId, unitNo, start, end, rent, services = 0, status = 'ACTIVE') => {
    await as('superuser');
    const unit = await val(`INSERT INTO mall_units (unit_number, floor, area_sqm) VALUES ($1, '1', 10) RETURNING id`, [unitNo]);
    const id = await val(
      `INSERT INTO lease_contracts (tenant_id, unit_id, start_date, end_date, monthly_rent, status, deposit_amount, services_amount)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7) RETURNING id`,
      [tenantId, unit, start, end, rent, status, services],
    );
    await as('authenticated');
    return id;
  };
  /** one tenant's rent in the books: revenue and receivable in the ledger against the charges themselves */
  const gl = async (tenantId) => ({
    revenue: Number(await val(`SELECT coalesce(sum(jl.credit - jl.debit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'POSTED'
      JOIN categories c ON c.id = jl.category_id AND c.code = 'REV-RNT' WHERE jl.contact_id = $1`, [tenantId])),
    receivable: Number(await val(`SELECT coalesce(sum(jl.debit - jl.credit), 0) FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_id AND je.status = 'POSTED'
      JOIN categories c ON c.id = jl.category_id AND c.code = 'AST-REC' WHERE jl.contact_id = $1`, [tenantId])),
    charged: Number(await val(`SELECT coalesce(sum(tc.amount), 0) FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id WHERE tc.type = 'RENT' AND lc.tenant_id = $1`, [tenantId])),
    open: Number(await val(`SELECT coalesce(sum(tc.amount - tc.total_paid), 0) FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id WHERE tc.type = 'RENT' AND lc.tenant_id = $1`, [tenantId])),
  });
  const rentCharges = (tenantId) =>
    rows(
      `SELECT to_char(tc.due_date, 'YYYY-MM') m, tc.amount::float a, tc.total_paid::float p, tc.status
       FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id WHERE lc.tenant_id = $1 AND tc.type = 'RENT' ORDER BY 1, tc.created_at`,
      [tenantId],
    );
  return { db, rows, val, cash, as, tenant, lease, gl, rentCharges };
}

async function scenarios(label, { with087 }) {
  const R = await replica({ with087 });
  const { db, rows, val, cash, as, tenant, lease, gl, rentCharges } = R;
  const expectFixed = (area, name, ok, detail) => check(area, `${label}: ${name}`, with087 ? ok : !ok, `${with087 ? '' : 'defect must reproduce on the baseline; '}${detail}`);

  // 1. a second lease must not raise a second rent charge for a month already charged
  {
    const t = await tenant('مستأجر محلين', 1000, 'S1');
    await lease(t, 'P1', '2026-01-01', '2027-01-01', 1000);
    await val(`SELECT generate_monthly_charges('2026-06')`);
    await lease(t, 'P2', '2026-05-01', '2027-05-01', 800);
    const run2 = await val(`SELECT generate_monthly_charges('2026-06')`);
    const june = (await rentCharges(t)).filter((c) => c.m === '2026-06');
    expectFixed('one charge per month', 'a second lease does not raise a second June rent charge', june.length === 1, `charges=${june.length} reported created=${run2.created}`);
  }

  // 2. a lease that has not started is not billed services; the others are
  {
    const t = await tenant('مستأجر مستقبلي', 1500, 'F1');
    await lease(t, 'F1U', '2026-09-01', '2027-08-31', 1500, 250);
    const t2 = await tenant('مستأجر قائم', 1500, 'F2');
    await lease(t2, 'F2U', '2026-01-01', '2027-12-31', 1500, 100);
    const t3 = await tenant('عقد منتهٍ ما زال نشطاً', 1500, 'F3');
    await lease(t3, 'F3U', '2026-01-01', '2026-03-31', 1500, 70);
    await val(`SELECT generate_monthly_charges('2026-06')`);
    const svc = async (id) => Number(await val(`SELECT count(*) FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id WHERE lc.tenant_id = $1 AND tc.type = 'SERVICE'`, [id]));
    expectFixed('services', 'no service charge for a lease that starts in September', (await svc(t)) === 0, `charges=${await svc(t)}`);
    check('services', `${label}: a running lease is still billed its services`, (await svc(t2)) === 1, `charges=${await svc(t2)}`);
    check('services', `${label}: a lease still ACTIVE past its end date is still billed (the owner is told by the expiry list)`, (await svc(t3)) === 1, `charges=${await svc(t3)}`);
  }

  // 3. a narrowed price schedule gives the months it no longer covers back to the base rent
  const t3 = await tenant('مستأجر جدول أسعار', 1200, 'B1');
  await lease(t3, 'B1U', '2026-03-01', '2027-03-01', 1200);
  for (const m of ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07']) await val(`SELECT generate_monthly_charges($1)`, [m]);
  const set = (bands) => val(`SELECT set_tenant_rent_price_bands($1, $2::jsonb)`, [t3, JSON.stringify(bands)]);
  await set([{ from_month: '2026-03', to_month: '2026-12', amount: 900 }]);
  await val(`SELECT record_rent_payment($1, 450, '2026-10-05'::date, $2, NULL, $3::text[], 'CASH')`, [t3, cash, pgArray(['2026-04'])]);
  const afterBand = await gl(t3);
  expectFixed('price schedule', 'revenue and receivable follow the charges after a schedule is set', near(afterBand.revenue, afterBand.charged) && near(afterBand.receivable, afterBand.open), JSON.stringify(afterBand));
  await set([{ from_month: '2026-06', to_month: '2026-12', amount: 900 }]);
  const narrowed = await rentCharges(t3);
  const byMonth = Object.fromEntries(narrowed.map((c) => [c.m, c]));
  expectFixed('price schedule', 'untouched unpaid months outside the narrowed schedule are back at the base rent', near(byMonth['2026-03'].a, 1200) && near(byMonth['2026-05'].a, 1200), `March=${byMonth['2026-03'].a} May=${byMonth['2026-05'].a}`);
  check('price schedule', `${label}: the part-paid month keeps its price`, near(byMonth['2026-04'].a, 900) && near(byMonth['2026-04'].p, 450), `April=${byMonth['2026-04'].a}/${byMonth['2026-04'].p}`);
  check('price schedule', `${label}: months inside the schedule are at the schedule's price`, near(byMonth['2026-06'].a, 900) && near(byMonth['2026-07'].a, 900), `June=${byMonth['2026-06'].a} July=${byMonth['2026-07'].a}`);
  const narrowedGl = await gl(t3);
  expectFixed('price schedule', 'revenue and receivable still equal the charges after narrowing', near(narrowedGl.revenue, narrowedGl.charged) && near(narrowedGl.receivable, narrowedGl.open), JSON.stringify(narrowedGl));
  await set([]);
  const removed = await gl(t3);
  // back at the original price, the baseline's untouched accruals happen to be right again: no defect here, so both must pass
  check('price schedule', `${label}: removing the schedule returns the months to the base rent with the ledger equal to the charges`, near(removed.revenue, removed.charged) && near(removed.receivable, removed.open), JSON.stringify(removed));
  await set([{ from_month: '2026-06', to_month: '2026-12', amount: 1500 }]);
  await val(`SELECT record_rent_payment($1, 1500, '2026-10-06'::date, $2, NULL, $3::text[], 'CASH')`, [t3, cash, pgArray(['2026-06'])]);
  const collected = await gl(t3);
  expectFixed('price schedule', 'collecting a month at a raised price leaves the ledger equal to the charges', near(collected.revenue, collected.charged) && near(collected.receivable, collected.open), JSON.stringify(collected));

  // 4. a schedule that covers a closed month does not fail, and the closed accrual is left alone
  {
    const t = await tenant('مستأجر فترة مقفلة', 1000, 'C1');
    await lease(t, 'C1U', '2026-01-01', '2027-01-01', 1000);
    for (const m of ['2026-01', '2026-02']) await val(`SELECT generate_monthly_charges($1)`, [m]);
    await as('superuser');
    await db.query(`UPDATE fiscal_periods SET is_closed = true WHERE start_date <= '2026-01-15' AND end_date >= '2026-01-15'`);
    await as('authenticated');
    let failed = null;
    try {
      await val(`SELECT set_tenant_rent_price_bands($1, $2::jsonb)`, [t, JSON.stringify([{ from_month: '2026-01', to_month: '2026-12', amount: 700 }])]);
    } catch (error) {
      failed = error.message;
    }
    check('closed period', `${label}: changing a schedule that covers a closed month does not fail`, failed === null, failed ?? '');
    const accrual = async (month) =>
      Number(await val(`SELECT coalesce(sum(jl.credit), 0) FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id
        JOIN journal_entries je ON je.source_type = 'CHARGE' AND je.source_id = tc.id AND je.status = 'POSTED'
        JOIN journal_lines jl ON jl.journal_id = je.id JOIN categories c ON c.id = jl.category_id AND c.code = 'REV-RNT'
        WHERE lc.tenant_id = $1 AND to_char(tc.due_date, 'YYYY-MM') = $2`, [t, month]));
    check('closed period', `${label}: the closed month's accrual stays as posted`, near(await accrual('2026-01'), 1000), `accrued=${await accrual('2026-01')}`);
    expectFixed('closed period', 'the open month after it follows the new price', near(await accrual('2026-02'), 700), `accrued=${await accrual('2026-02')}`);
  }
  return R;
}

const signatures = async (db) =>
  Object.fromEntries(
    (await db.query(`SELECT p.proname, md5(pg_get_functiondef(p.oid)) h FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('ensure_tenant_rent_charges', 'generate_monthly_charges', 'sync_rent_charges_to_schedule')`)).rows.map((r) => [r.proname, r.h]),
  );

const base = await scenarios('baseline', { with087: false });
const fixed = await scenarios('087', { with087: true });

// rollback: baseline + 087 + rollback = baseline
{
  const baseline = await signatures(base.db);
  const rolled = fixed;
  await actAs(rolled.db, 'superuser');
  const changed = await signatures(rolled.db);
  await rolled.db.exec(read('087_rent_charge_integrity.ROLLBACK.sql'));
  const restored = await signatures(rolled.db);
  check('rollback', '087 changes exactly the three functions', Object.keys(baseline).every((k) => baseline[k] !== changed[k]), JSON.stringify(Object.keys(baseline)));
  check('rollback', 'the rollback restores them byte for byte', Object.keys(baseline).every((k) => baseline[k] === restored[k]), JSON.stringify({ baseline, restored }));
  // and applying twice is harmless
  let twice = null;
  try {
    await rolled.db.exec(read('087_rent_charge_integrity.sql'));
    await rolled.db.exec(read('087_rent_charge_integrity.sql'));
  } catch (error) {
    twice = error.message;
  }
  check('rollback', '087 can be applied again over itself (idempotent)', twice === null, twice ?? '');
}

const areas = [...new Set(results.map((r) => r.area))];
for (const area of areas) {
  console.log(`\n${area}`);
  for (const r of results.filter((x) => x.area === area)) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n        ${r.detail}`}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ''}`);
process.exit(failed.length ? 1 : 0);
