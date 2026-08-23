/**
 * Isolated, in-process Postgres 17 replica (PGlite) for destructive tests.
 * Nothing here connects to Supabase except the optional, read-only fetch of the
 * live function definitions (`prodFunctions: true`), which runs inside BEGIN READ ONLY.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const require = createRequire(resolve(ROOT, 'package.json'));

function loadPglite() {
  try {
    return {
      PGlite: require('@electric-sql/pglite').PGlite,
      pgcrypto: require('@electric-sql/pglite/contrib/pgcrypto').pgcrypto,
      uuid_ossp: require('@electric-sql/pglite/contrib/uuid_ossp').uuid_ossp,
    };
  } catch {
    throw new Error('Missing @electric-sql/pglite. Install it as a devDependency: npm i -D @electric-sql/pglite@0.4.1');
  }
}

/** Minimal stand-ins for what Supabase provides before our migrations run. */
const SUPABASE_STUBS = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
DO $$ BEGIN CREATE ROLE postgres NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth, extensions, public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

export function readLocalEnv() {
  const text = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
      }),
  );
}

/** Reads function bodies, views and RLS policies from production inside a read-only transaction. */
async function fetchProductionLogic() {
  const pg = require('pg');
  const env = readLocalEnv();
  const connectionString = (env.DATABASE_URL || env.DIRECT_URL || '').replace('?pgbouncer=true', '');
  if (!connectionString) throw new Error('Set DATABASE_URL or DIRECT_URL in .env.local to use --prod-functions.');
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const functions = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prokind = 'f'
      ORDER BY p.proname`);
    const views = await client.query(`
      SELECT c.relname AS name, pg_get_viewdef(c.oid, true) AS def
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'v'`);
    const policies = await client.query(`
      SELECT tablename, policyname, permissive, roles::text[] AS roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = 'public'`);
    await client.query('ROLLBACK');
    return { functions: functions.rows.map((r) => r.def), views: views.rows, policies: policies.rows };
  } finally {
    await client.end();
  }
}

export async function createReplica({ prodFunctions = false } = {}) {
  const { PGlite, pgcrypto, uuid_ossp } = loadPglite();
  const db = await PGlite.create({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(SUPABASE_STUBS);

  const dir = resolve(ROOT, 'supabase/migrations');
  const files = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  const migrations = [];
  for (const file of files) {
    try {
      await db.exec(readFileSync(resolve(dir, file), 'utf8'));
      migrations.push({ file, ok: true });
    } catch (error) {
      migrations.push({ file, ok: false, error: error.message });
    }
  }
  // A fresh install must apply in order; a second pass separates ordering bugs from hard failures.
  for (const m of migrations.filter((x) => !x.ok)) {
    try {
      await db.exec(readFileSync(resolve(dir, m.file), 'utf8'));
      m.secondPass = 'ok';
    } catch (error) {
      m.secondPass = error.message;
    }
  }

  let overlay = null;
  if (prodFunctions) {
    const prod = await fetchProductionLogic();
    overlay = { applied: 0, failed: [] };
    const apply = async (label, sql) => {
      try {
        await db.exec(sql);
        overlay.applied += 1;
      } catch (error) {
        overlay.failed.push(`${label}: ${error.message}`);
      }
    };
    for (const def of prod.functions) await apply(def.slice(27, 80), def);
    for (const v of prod.views) await apply(`view ${v.name}`, `CREATE OR REPLACE VIEW public.${v.name} AS ${v.def}`);
    // Mirror production RLS exactly: drop every replica policy, then recreate the live set.
    const existing = (await db.query(`SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'`)).rows;
    for (const p of existing) await db.exec(`DROP POLICY IF EXISTS "${p.policyname}" ON public.${p.tablename}`);
    for (const p of prod.policies) {
      await apply(`policy ${p.tablename}.${p.policyname}`,
        `CREATE POLICY "${p.policyname}" ON public.${p.tablename} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.join(', ')}` +
        (p.qual ? ` USING (${p.qual})` : '') + (p.with_check ? ` WITH CHECK (${p.with_check})` : ''));
    }
  }
  return { db, migrations, overlay };
}

/** Switch the session to a Supabase API role, the way PostgREST does per request. */
export async function actAs(db, role, userId = null) {
  await db.exec('RESET ROLE');
  if (role === 'superuser') {
    await db.query(`SELECT set_config('request.jwt.claims', '', false)`);
    return;
  }
  const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`SET ROLE ${role}`);
}
