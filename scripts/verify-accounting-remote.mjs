// Verify accounting & reports migrations are applied to the remote DB.
// Usage: node scripts/verify-accounting-remote.mjs
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

function loadEnv(file) {
  const txt = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv('.env.local');
// Prefer the pooler URL here (direct host not resolvable from this network).
const conn = env.DATABASE_URL || env.DIRECT_URL;

const checks = [
  {
    label: 'RPC: tenant_rent_summary_for_month (047)',
    sql: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='tenant_rent_summary_for_month' AND n.nspname='public' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'View: cashbox_balances.opening_balance (048)',
    sql: `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cashbox_balances' AND column_name='opening_balance' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'RPC: get_cash_flow (uses cashbox_balances)',
    sql: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='get_cash_flow' AND n.nspname='public' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'Trigger fn: process_disbursement_voucher_posting (049)',
    sql: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='process_disbursement_voucher_posting' AND n.nspname='public' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'RPC: get_general_ledger_lines (050 opening balance)',
    sql: `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='get_general_ledger_lines' AND n.nspname='public' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'Column: transactions.reconciled_at (042)',
    sql: `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions' AND column_name='reconciled_at' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'Table: budgets (043)',
    sql: `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='budgets' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'New expense category: م.مساعدات وصدقات (046)',
    sql: `SELECT 1 FROM categories WHERE code='EXP-AID' AND name_ar LIKE '%مساعدات%' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'New expense category: م.وقود وزيوت (046)',
    sql: `SELECT 1 FROM categories WHERE code='EXP-FUL' AND name_ar LIKE '%وقود%' LIMIT 1`,
    expect: 1,
  },
  {
    label: 'New expense category: م.بريد (046)',
    sql: `SELECT 1 FROM categories WHERE code='EXP-POS' AND name_ar LIKE '%بريد%' LIMIT 1`,
    expect: 1,
  },
];

// Runtime probes (call RPCs to confirm they execute without error)
const probes = [
  {
    label: 'RPC call: get_trial_balance(current year) returns rows+summary',
    sql: `SELECT (r->>'rows') IS NOT NULL AS has_rows, (r->'summary') IS NOT NULL AS has_summary FROM get_trial_balance(EXTRACT(YEAR FROM CURRENT_DATE)::int) r`,
  },
  {
    label: 'RPC call: get_general_ledger_lines returns opening+lines',
    sql: `SELECT (r->'opening_debit') IS NOT NULL AS has_opening, (r->'lines') IS NOT NULL AS has_lines FROM (SELECT get_general_ledger_lines(NULL, NULL, NULL) r) q`,
  },
];

async function main() {
  if (!conn) {
    console.error('No DATABASE_URL/DIRECT_URL found in .env.local');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: conn, connectionTimeoutMillis: 15000 });
  await client.connect();
  console.log('Connected to remote DB. Running verification checks...\n');

  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const c of checks) {
    try {
      const res = await client.query(c.sql);
      const got = Number(res.rows[0]?.count ?? res.rows.length ?? 0);
      // The queries select `1` if found; rows.length will be 1 when found, 0 when not.
      const ok = res.rows.length > 0;
      if (ok) {
        pass++;
        console.log(`  ✓ ${c.label}`);
      } else {
        fail++;
        failures.push(c.label);
        console.log(`  ✗ ${c.label}  — NOT FOUND`);
      }
    } catch (e) {
      fail++;
      failures.push(c.label);
      console.log(`  ✗ ${c.label}  — ERROR: ${e.message}`);
    }
  }

  console.log('\nRuntime RPC probes:');
  for (const p of probes) {
    try {
      const res = await client.query(p.sql);
      const row = res.rows[0] || {};
      const ok = Object.values(row).every(Boolean);
      if (ok) {
        pass++;
        console.log(`  ✓ ${p.label}  → ${JSON.stringify(row)}`);
      } else {
        fail++;
        failures.push(p.label);
        console.log(`  ✗ ${p.label}  → ${JSON.stringify(row)}`);
      }
    } catch (e) {
      fail++;
      failures.push(p.label);
      console.log(`  ✗ ${p.label}  — ERROR: ${e.message}`);
    }
  }

  await client.end();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  if (failures.length) {
    console.log('Failures:\n  - ' + failures.join('\n  - '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
