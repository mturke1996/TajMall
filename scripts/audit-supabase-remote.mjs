/** Read-only Supabase audit for rent schema and aggregate consistency. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

function readLocalEnv() {
  const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim().replace(/^"|"$/g, ''),
        ];
      }),
  );
}

const env = readLocalEnv();
const connectionString = (env.DATABASE_URL || env.DIRECT_URL || '').replace('?pgbouncer=true', '');
if (!connectionString) {
  throw new Error('Set DATABASE_URL or DIRECT_URL in .env.local before running this read-only audit.');
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 10_000,
  query_timeout: 15_000,
});

const requiredRoutines = [
  'set_tenant_rent_month_status',
  'record_rent_payment',
  'ensure_tenant_rent_charges',
  'ensure_tenant_lease_contract',
  'get_tenant_rent_calendar',
  'recalc_tenant_charge_rent_paid',
  'purge_rent_links_for_journal',
  'reverse_journal_entry',
  'dedupe_rent_charges_data',
];

const issues = [];
const checks = [];

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '10s'");

  const { rows: metadata } = await client.query(`
    SELECT current_database() AS database_name,
           current_user AS connected_role,
           version() AS server_version
  `);
  checks.push(`Connected to ${metadata[0].database_name}; read-only transaction active`);

  const { rows: relations } = await client.query(`
    SELECT name, to_regclass('public.' || name) IS NOT NULL AS exists
    FROM unnest(ARRAY['tenant_charges', 'tenant_rent_journal_links', 'lease_contracts', 'journal_entries']::text[]) AS name
    ORDER BY name
  `);
  for (const relation of relations) {
    if (relation.exists) checks.push(`TABLE public.${relation.name}: present`);
    else issues.push(`TABLE public.${relation.name}: missing`);
  }

  const { rows: summary } = await client.query(`
    SELECT to_regclass('public.tenant_rent_summary') IS NOT NULL AS exists
  `);
  if (!summary[0].exists) {
    issues.push('VIEW public.tenant_rent_summary: missing');
  } else {
    const { rows } = await client.query('SELECT count(*) AS row_count FROM public.tenant_rent_summary');
    checks.push(`VIEW tenant_rent_summary: present (${rows[0].row_count} rows)`);
  }

  const { rows: routines } = await client.query(`
    SELECT requested.name,
           EXISTS (
             SELECT 1 FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = requested.name
           ) AS exists
    FROM unnest($1::text[]) AS requested(name)
    ORDER BY requested.name
  `, [requiredRoutines]);
  for (const routine of routines) {
    if (routine.exists) checks.push(`FUNCTION public.${routine.name}: present`);
    else issues.push(`FUNCTION public.${routine.name}: missing`);
  }

  const { rows: duplicateCharges } = await client.query(`
    SELECT count(*) AS duplicate_groups
    FROM (
      SELECT contract_id, date_trunc('month', due_date)
      FROM public.tenant_charges
      WHERE type = 'RENT'
        AND due_date >= date_trunc('year', CURRENT_DATE)
        AND due_date < date_trunc('year', CURRENT_DATE) + interval '1 year'
      GROUP BY contract_id, date_trunc('month', due_date)
      HAVING count(*) > 1
    ) duplicates
  `);
  const duplicateCount = Number(duplicateCharges[0].duplicate_groups);
  if (duplicateCount > 0) issues.push(`DATA: ${duplicateCount} duplicate rent contract-month groups`);
  else checks.push('DATA: no duplicate rent contract-month groups in the current year');

  const { rows: mismatches } = await client.query(`
    WITH paid_links AS (
      SELECT l.charge_id, sum(l.amount) AS linked_paid
      FROM public.tenant_rent_journal_links l
      JOIN public.journal_entries je ON je.id = l.journal_entry_id
      WHERE je.status IN ('POSTED', 'DRAFT')
      GROUP BY l.charge_id
    )
    SELECT count(*) AS mismatch_count
    FROM public.tenant_charges c
    LEFT JOIN paid_links p ON p.charge_id = c.id
    WHERE c.type = 'RENT'
      AND abs(coalesce(c.total_paid, 0) - least(coalesce(p.linked_paid, 0), c.amount)) > 0.02
      AND (coalesce(p.linked_paid, 0) > 0 OR coalesce(c.total_paid, 0) > 0)
  `);
  const mismatchCount = Number(mismatches[0].mismatch_count);
  if (mismatchCount > 0) issues.push(`DATA: ${mismatchCount} rent charges disagree with journal links`);
  else checks.push('DATA: rent charge totals agree with posted/draft journal links');

  console.log('Read-only Supabase rent audit');
  console.log(`Database server: ${metadata[0].server_version}`);
  console.log('\nChecks:');
  checks.forEach((message) => console.log(`  PASS  ${message}`));
  console.log('\nIssues:');
  if (issues.length === 0) console.log('  None');
  else issues.forEach((message) => console.log(`  FAIL  ${message}`));
  process.exitCode = issues.length === 0 ? 0 : 1;
} finally {
  try {
    await client.query('ROLLBACK');
  } catch {}
  await client.end().catch(() => {});
}
