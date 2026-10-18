/**
 * Proves src/lib/rent-allocation.ts predicts what the database does with a rent payment.
 *   npx tsx scripts/verify-rent-allocation.mjs
 *
 * 1. Hand-written cases (half month, a month and a half, partly paid month, price bands, re-pricing).
 * 2. The same engine against the real functions on an isolated PGlite replica (repository migrations +
 *    078, whose record_rent_payment / set_tenant_rent_month_status are the production bodies; the
 *    pricing functions are byte-identical to production): many random tenants and payments, each one
 *    predicted first, then recorded, then compared month by month.
 * Never touches production. Exit code 1 on any mismatch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { resolveRentAmount, rentMonthBasis, allocateRentPayment, monthsAreConsecutive } = await import(
  '../src/lib/rent-allocation.ts'
);

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
};

// ── 1. Engine cases ─────────────────────────────────────────────────────────
const P = (contactRent, bands = [], leaseRent = null) => ({ contactRent, bands, leaseRent });
const codes = (a) => a.issues.map((i) => i.code);

test('price: band beats lease beats contact', () => {
  const pricing = P(1000, [{ from_month: '2026-04', to_month: '2026-12', amount: 2500 }], 1800);
  assert.equal(resolveRentAmount('2026-03', pricing), 1800);
  assert.equal(resolveRentAmount('2026-04', pricing), 2500);
  assert.equal(resolveRentAmount('2027-01', P(1000)), 1000);
  assert.equal(resolveRentAmount('2026-05', P(0, [], 0)), 0);
});
test('price: the latest-starting band wins on overlap', () => {
  const pricing = P(1000, [
    { from_month: '2026-01', to_month: '2026-12', amount: 2000 },
    { from_month: '2026-06', to_month: '2026-08', amount: 2600 },
  ]);
  assert.equal(resolveRentAmount('2026-05', pricing), 2000);
  assert.equal(resolveRentAmount('2026-07', pricing), 2600);
});
test('basis: untouched unpaid charge is re-priced, a partly paid one is not', () => {
  const pricing = P(2000);
  const a = rentMonthBasis('2026-05', { amount: 1500, total_paid: 0, status: 'UNPAID' }, pricing);
  assert.equal(a.amount, 2000);
  assert.equal(a.repricedFrom, 1500);
  const b = rentMonthBasis('2026-05', { amount: 1500, total_paid: 500, status: 'PARTIAL' }, pricing);
  assert.equal(b.amount, 1500);
  assert.equal(b.remaining, 1000);
  assert.equal(b.repricedFrom, null);
});
test('half a month', () => {
  const basis = [rentMonthBasis('2026-05', null, P(2500))];
  const a = allocateRentPayment(basis, 1250);
  assert.ok(a.ok, codes(a).join());
  assert.deepEqual(a.lines.map((l) => [l.month, l.applied, l.status]), [['2026-05', 1250, 'partial']]);
});
test('a month and a half across two months', () => {
  const basis = ['2026-05', '2026-06'].map((m) => rentMonthBasis(m, null, P(2500)));
  const a = allocateRentPayment(basis, 3750);
  assert.ok(a.ok, codes(a).join());
  assert.deepEqual(a.lines.map((l) => [l.applied, l.status]), [[2500, 'paid'], [1250, 'partial']]);
  assert.equal(a.minimumAmount, 2500.001);
});
test('second half of a partly paid month, then the next month in full', () => {
  const basis = [
    rentMonthBasis('2026-05', { amount: 2500, total_paid: 1250, status: 'PARTIAL' }, P(2500)),
    rentMonthBasis('2026-06', null, P(2500)),
  ];
  const a = allocateRentPayment(basis, 3750);
  assert.ok(a.ok);
  assert.deepEqual(a.lines.map((l) => [l.applied, l.paidAfter, l.status]), [[1250, 2500, 'paid'], [2500, 2500, 'paid']]);
});
test('overpayment is refused', () => {
  const a = allocateRentPayment([rentMonthBasis('2026-05', null, P(2500))], 3000);
  assert.deepEqual(codes(a), ['overpaid']);
  assert.equal(a.leftover, 500);
});
test('an amount that runs out before the last month is refused', () => {
  const basis = ['2026-05', '2026-06', '2026-07'].map((m) => rentMonthBasis(m, null, P(1000)));
  const a = allocateRentPayment(basis, 1500);
  assert.deepEqual(codes(a), ['does_not_reach']);
  assert.equal(a.issues[0].month, '2026-07');
  assert.equal(a.issues[0].needsMoreThan, 2000);
});
test('a fully paid month is refused', () => {
  const basis = [rentMonthBasis('2026-05', { amount: 1000, total_paid: 1000, status: 'PAID' }, P(1000))];
  assert.ok(codes(allocateRentPayment(basis, 1000)).includes('already_paid'));
});
test('a month without any price is refused', () => {
  assert.ok(codes(allocateRentPayment([rentMonthBasis('2026-05', null, P(0))], 100)).includes('no_price'));
});
test('months must be consecutive, across the year boundary too', () => {
  assert.ok(monthsAreConsecutive(['2026-12', '2027-01']));
  assert.ok(!monthsAreConsecutive(['2026-10', '2026-12']));
});
test('three-decimal amounts stay exact', () => {
  const basis = ['2026-05', '2026-06', '2026-07'].map((m) => rentMonthBasis(m, null, P(333.333)));
  const a = allocateRentPayment(basis, 999.999);
  assert.ok(a.ok, codes(a).join());
  assert.equal(a.leftover, 0);
  assert.ok(a.lines.every((l) => l.status === 'paid'));
});

// ── 2. Against the database functions ───────────────────────────────────────
const { createReplica, actAs } = await import('./lib/pglite-replica.mjs');
const { db } = await createReplica();
await db.exec(readFileSync('docs/proposed-migrations/078_security_and_ledger_fixes.sql', 'utf8'));
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const val = async (sql, params) => Object.values((await rows(sql, params))[0] ?? {})[0];

await actAs(db, 'superuser');
const OWNER = '11111111-1111-4111-8111-111111111111';
await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@test.local')`, [OWNER]);
await db.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
await db.query(`INSERT INTO profiles (id, role) VALUES ($1, 'owner') ON CONFLICT (id) DO UPDATE SET role = 'owner'`, [OWNER]);
const CASH = await val(`SELECT id FROM cashboxes WHERE active AND kind = 'CASH' ORDER BY code LIMIT 1`);
await actAs(db, 'authenticated', OWNER);

let seed = 20261018;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const monthsFrom = (start, count) => {
  const [y, m] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const t = y * 12 + (m - 1) + i;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  });
};

async function snapshot(tenant, months) {
  const contactRent = Number(await val(`SELECT monthly_rent FROM contacts WHERE id = $1`, [tenant])) || 0;
  const leaseRent = Number(await val(`SELECT monthly_rent FROM lease_contracts WHERE tenant_id = $1 AND status = 'ACTIVE' ORDER BY start_date DESC LIMIT 1`, [tenant])) || 0;
  const bands = await rows(`SELECT from_month, to_month, amount FROM tenant_rent_price_bands WHERE tenant_id = $1`, [tenant]);
  const charges = await rows(`
    SELECT to_char(tc.due_date, 'YYYY-MM') AS month, tc.amount, tc.total_paid, tc.status
    FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id
    WHERE lc.tenant_id = $1 AND tc.type = 'RENT'`, [tenant]);
  const byMonth = new Map(charges.map((c) => [c.month, c]));
  return months.map((m) => rentMonthBasis(m, byMonth.get(m) ?? null, { bands, leaseRent, contactRent }));
}

const paidByMonth = async (tenant) => new Map((await rows(`
  SELECT to_char(tc.due_date, 'YYYY-MM') AS month, tc.total_paid, tc.status
  FROM tenant_charges tc JOIN lease_contracts lc ON lc.id = tc.contract_id
  WHERE lc.tenant_id = $1 AND tc.type = 'RENT'`, [tenant])).map((r) => [r.month, r]));

let dbCases = 0;
const outcomes = { ok: 0, overpaid: 0, does_not_reach: 0, already_paid: 0 };
for (let t = 0; t < 60; t++) {
  const rent = pick([1000, 1250, 2500, 3333.333, 1800.5]);
  const created = await val(`SELECT create_contact($1::jsonb)`, [JSON.stringify({
    kind: 'TENANT', name: `مستأجر تحقق ${t}`, shop_number: `V-${t}`, monthly_rent: rent, contract_start: '2025-01-01',
  })]);
  const tenant = created?.id ?? created?.contact?.id ?? created;
  await val(`SELECT ensure_tenant_lease_contract($1)`, [tenant]);
  if (rand() < 0.3) {
    // the contract rent differs from the tenant's base rent: the contract wins
    await db.query(`UPDATE lease_contracts SET monthly_rent = $2 WHERE tenant_id = $1`, [tenant, pick([900, 2200.75])]);
  }
  if (rand() < 0.3) {
    // charges generated earlier at the old price; the band below makes them stale (re-priced on payment)
    await val(`SELECT ensure_tenant_rent_charges($1, $2::text[])`, [tenant, '{2026-01,2026-02,2026-03,2026-04,2026-05}']);
  }
  if (rand() < 0.5) {
    await val(`SELECT set_tenant_rent_price_bands($1, $2::jsonb)`, [tenant, JSON.stringify([
      { from_month: '2026-03', to_month: '2026-12', amount: pick([1500, 2750, 4000.25]) },
    ])]);
  }
  // A few payments per tenant, each starting where the last left off, sometimes a part of a month.
  let cursor = pick(['2026-01', '2026-02', '2026-03']);
  for (let p = 0; p < 4; p++) {
    const span = pick([1, 1, 2, 3]);
    const months = monthsFrom(cursor, span);
    const basis = await snapshot(tenant, months);
    const owed = basis.reduce((s, b) => s + b.remaining, 0);
    const before = basis.slice(0, -1).reduce((s, b) => s + b.remaining, 0);
    const lastOwed = basis[basis.length - 1].remaining;
    const kind = pick(['exact', 'exact', 'part-of-last', 'over', 'short', 'repay']);
    let amount;
    let pay = months;
    if (kind === 'exact') amount = owed;
    else if (kind === 'part-of-last') amount = before + Math.round(lastOwed * pick([0.5, 0.25, 0.8]) * 1000) / 1000;
    else if (kind === 'over') amount = owed + pick([1, 250, 1000]);
    else if (kind === 'short') amount = Math.max(before - pick([1, 100]), 1);
    else {
      // pay again a month that is already settled (only meaningful once something was paid)
      pay = monthsFrom(cursor, 1);
      amount = lastOwed > 0 ? lastOwed : 500;
    }
    const plan = allocateRentPayment(await snapshot(tenant, pay), amount);
    const has = (code) => plan.issues.some((i) => i.code === code);
    // what the database itself rejects comes first; the rest it accepts, possibly losing money
    const issue = has('no_amount') ? 'no_amount' : has('does_not_reach') ? 'does_not_reach' : plan.issues[0]?.code ?? 'ok';
    const result = await (async () => {
      try {
        await val(`SELECT record_rent_payment($1, $2, '2026-10-18'::date, $3, NULL, $4::text[], 'CASH')`,
          [tenant, amount, CASH, `{${pay.join(',')}}`]);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    })();
    dbCases += 1;
    outcomes[issue] = (outcomes[issue] ?? 0) + 1;
    const label = `tenant ${t} payment ${p} (${kind}, ${pay.join('+')}, ${amount})`;
    const after = await paidByMonth(tenant);
    if (issue === 'does_not_reach' || issue === 'no_amount') {
      if (result.ok) failures.push(`${label}: engine refused (${issue}) but the database accepted it`);
    } else if (!result.ok) {
      failures.push(`${label}: engine predicted ${issue}, database raised: ${result.error.slice(0, 120)}`);
    } else {
      for (const line of plan.lines) {
        const got = Number(after.get(line.month)?.total_paid ?? 0);
        if (Math.abs(got - line.paidAfter) > 0.0005) {
          failures.push(`${label}: ${line.month} engine ${line.paidAfter} vs database ${got}`);
        }
        const expectStatus = line.paidAfter + 0.0005 >= line.amount ? 'PAID' : line.paidAfter > 0 ? 'PARTIAL' : 'UNPAID';
        if (line.amount > 0 && after.get(line.month)?.status !== expectStatus) {
          failures.push(`${label}: ${line.month} status engine ${expectStatus} vs database ${after.get(line.month)?.status}`);
        }
      }
      // The engine refuses these on screen; the database records them. What it links must be exactly
      // the amount minus the predicted leftover (money recorded as revenue but tied to no month).
      const linked = Number(await val(`
        SELECT coalesce(sum(l.amount), 0) FROM tenant_rent_journal_links l
        JOIN journal_entries je ON je.id = l.journal_entry_id AND je.source_type = 'TRANSACTION'
        WHERE je.source_id = (SELECT id FROM transactions WHERE contact_id = $1 ORDER BY number DESC LIMIT 1)`, [tenant]));
      if (Math.abs(linked - (amount - plan.leftover)) > 0.0005) {
        failures.push(`${label}: linked ${linked}, engine predicted ${amount - plan.leftover} (leftover ${plan.leftover})`);
      }
    }
    if (kind !== 'repay') {
      // next payment starts at the first month still owing: the last one if it was only partly paid
      const last = months[months.length - 1];
      cursor = after.get(last)?.status === 'PAID' ? monthsFrom(last, 2)[1] : last;
    }
  }
}

if (failures.length) {
  console.error(failures.slice(0, 30).join('\n'));
  console.error(`\n✗ verify-rent-allocation: ${failures.length} failure(s); ${passed} engine cases passed, ${dbCases} database cases run`);
  process.exit(1);
}
console.log(`✓ verify-rent-allocation: ${passed} engine cases; ${dbCases} payments match the database month by month`, outcomes);
