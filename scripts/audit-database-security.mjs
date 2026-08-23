import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

function readLocalEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  const text = readFileSync(envPath, 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
        return [key, value];
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

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '10s'");

  const { rows: metadata } = await client.query(`
    SELECT current_database() AS database_name, current_user AS connected_role, version() AS server_version
  `);
  const { rows: functions } = await client.query(`
      SELECT p.proname AS function_name,
             pg_get_function_identity_arguments(p.oid) AS arguments,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
      ORDER BY p.proname, arguments
  `);
  const { rows: policies } = await client.query(`
      SELECT tablename, policyname, cmd, roles::text AS roles,
             coalesce(qual, '') AS using_expression,
             coalesce(with_check, '') AS check_expression
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          (cmd = 'ALL' AND lower(trim(coalesce(qual, ''))) IN ('true', '(true)')
                      AND lower(trim(coalesce(with_check, ''))) IN ('true', '(true)'))
          OR (cmd = 'INSERT' AND lower(trim(coalesce(with_check, ''))) IN ('true', '(true)'))
          OR (cmd = 'UPDATE' AND lower(trim(coalesce(qual, ''))) IN ('true', '(true)')
                          AND lower(trim(coalesce(with_check, ''))) IN ('true', '(true)'))
          OR (cmd = 'DELETE' AND lower(trim(coalesce(qual, ''))) IN ('true', '(true)'))
        )
      ORDER BY tablename, policyname
  `);
  const { rows: privileges } = await client.query(`
      WITH tables(table_name) AS (VALUES
        ('journal_entries'), ('journal_lines'), ('fiscal_periods'), ('lease_contracts'),
        ('mall_units'), ('tenant_charges'), ('tenant_charge_allocations'),
        ('receipt_vouchers'), ('receipt_voucher_lines'), ('correspondence_letters'),
        ('app_notifications'), ('contacts'), ('transactions')
      )
      SELECT t.table_name,
             to_regclass('public.' || t.table_name) IS NOT NULL AS exists,
             CASE WHEN to_regclass('public.' || t.table_name) IS NULL THEN false
                  ELSE has_table_privilege('authenticated', to_regclass('public.' || t.table_name), 'SELECT') END AS authenticated_select,
             CASE WHEN to_regclass('public.' || t.table_name) IS NULL THEN false
                  ELSE has_table_privilege('authenticated', to_regclass('public.' || t.table_name), 'INSERT') END AS authenticated_insert,
             CASE WHEN to_regclass('public.' || t.table_name) IS NULL THEN false
                  ELSE has_table_privilege('authenticated', to_regclass('public.' || t.table_name), 'UPDATE') END AS authenticated_update,
             CASE WHEN to_regclass('public.' || t.table_name) IS NULL THEN false
                  ELSE has_table_privilege('authenticated', to_regclass('public.' || t.table_name), 'DELETE') END AS authenticated_delete
      FROM tables t ORDER BY t.table_name
  `);
  const { rows: rbacPolicies } = await client.query(`
    SELECT tablename, policyname, cmd, roles::text AS roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(ARRAY[
        'account_mappings', 'app_notifications', 'correspondence_letters',
        'fiscal_periods', 'journal_entries', 'journal_lines', 'lease_contracts',
        'mall_units', 'receipt_voucher_lines', 'receipt_vouchers',
        'tenant_charge_allocations', 'tenant_charges'
      ])
      AND policyname LIKE 'rbac_%'
    ORDER BY tablename, policyname
  `);
  const { rows: dataChecks } = await client.query(`
      SELECT
        (SELECT count(*) FROM public.transactions) AS transactions,
        (SELECT count(*) FROM public.transactions WHERE status = 'POSTED') AS posted_transactions,
        (SELECT count(*) FROM public.transactions t
          WHERE t.status = 'POSTED' AND t.contact_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = t.contact_id)) AS orphan_contact_transactions,
        (SELECT count(*) FROM public.journal_entries WHERE status = 'POSTED') AS posted_journals,
        (SELECT count(*) FROM public.journal_entries je
          WHERE je.status = 'POSTED' AND NOT EXISTS (
            SELECT 1 FROM public.journal_lines jl WHERE jl.journal_id = je.id
          )) AS posted_journals_without_lines,
        (SELECT count(*) FROM (
          SELECT je.id FROM public.journal_entries je
          JOIN public.journal_lines jl ON jl.journal_id = je.id
          WHERE je.status = 'POSTED'
          GROUP BY je.id
          HAVING abs(sum(jl.debit) - sum(jl.credit)) > 0.01
        ) unbalanced) AS unbalanced_posted_journals,
        (SELECT count(*) FROM public.contacts) AS contacts,
        (SELECT count(*) FROM public.contacts WHERE is_active) AS active_contacts,
        (SELECT count(*) FROM public.contacts WHERE phone IS NULL OR btrim(phone) = '') AS contacts_missing_phone,
        (SELECT count(*) FROM public.contacts WHERE email IS NULL OR btrim(email) = '') AS contacts_missing_email,
        (SELECT count(*) FROM public.contacts WHERE address IS NULL OR btrim(address) = '') AS contacts_missing_address
  `);

  console.log('Database metadata:', metadata[0]);
  const anonExecutableFunctions = functions.filter((row) => row.anon_execute);
  console.log('SECURITY DEFINER functions:', {
    total: functions.length,
    executableByAnon: anonExecutableFunctions.length,
    executableByAuthenticated: functions.filter((row) => row.authenticated_execute).length,
  });
  console.log('Anon-executable SECURITY DEFINER function signatures:');
  console.log(anonExecutableFunctions.map((row) => `${row.function_name}(${row.arguments})`).join('; '));
  console.log('Broad write RLS policies:', policies.length);
  console.log(policies.map((row) => `${row.tablename}.${row.policyname} [${row.cmd}]`).join('; '));
  console.log('Existing targeted RBAC policies:');
  console.log(rbacPolicies.map((row) => `${row.tablename}.${row.policyname} [${row.cmd}]`).join('; '));
  console.log('Authenticated table grants by relation:');
  console.log(privileges.map((row) => `${row.table_name}: S${row.authenticated_select ? 1 : 0}/I${row.authenticated_insert ? 1 : 0}/U${row.authenticated_update ? 1 : 0}/D${row.authenticated_delete ? 1 : 0}`).join('; '));
  console.log('Aggregate integrity and contact coverage (no personal values):', dataChecks[0]);
} finally {
  try {
    await client.query('ROLLBACK');
  } catch {}
  await client.end().catch(() => {});
}
