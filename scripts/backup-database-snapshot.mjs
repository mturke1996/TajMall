/**
 * Read-only full snapshot of the live database, in the cold-backup format that
 * scripts/restore-cold-backup.mjs restores (manifest.json + tables/<table>.json in a ZIP),
 * plus schema/ (function bodies, views, RLS policies, grants) for reference.
 *
 *   node scripts/backup-database-snapshot.mjs [output-directory]
 *
 * Default output: ~/Fluxen-Backups (outside the repo — the files contain personal data).
 * Runs inside BEGIN READ ONLY with REPEATABLE READ so every table comes from one moment.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readLocalEnv } from './lib/pglite-replica.mjs';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const pg = require('pg');

// Keep values exactly as stored: no Date conversion (a DATE would shift by the local UTC offset).
for (const oid of [1082, 1083, 1114, 1184, 1266, 1186]) pg.types.setTypeParser(oid, (v) => v);
pg.types.setTypeParser(20, (v) => v); // int8 as text, no precision loss

const env = readLocalEnv();
// The direct host is IPv6-only on this project; the pooler keeps one server connection per transaction.
const connectionString = (env.DATABASE_URL || env.DIRECT_URL || '').replace('?pgbouncer=true', '');
if (!connectionString) throw new Error('Set DIRECT_URL or DATABASE_URL in .env.local.');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outRoot = resolve(process.argv[2] ?? join(homedir(), 'Fluxen-Backups'));
const work = join(outRoot, `fluxen-snapshot-${stamp}`);
mkdirSync(join(work, 'tables'), { recursive: true });
mkdirSync(join(work, 'schema'), { recursive: true });

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
const manifest = { id: `snapshot-${stamp}`, createdAt: new Date().toISOString(), format: 'fluxen-cold-backup-v1+schema', source: 'scripts/backup-database-snapshot.mjs', tables: {}, schema: {} };

try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const { rows: tables } = await client.query(`
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname`);
  for (const { name } of tables) {
    const pk = await client.query(`
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY array_position(i.indkey, a.attnum)) AS cols
      FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ('public.' || quote_ident($1))::regclass AND i.indisprimary`, [name]);
    const order = pk.rows[0]?.cols ? ` ORDER BY ${pk.rows[0].cols}` : '';
    const { rows } = await client.query(`SELECT * FROM public.${'"' + name.replace(/"/g, '""') + '"'}${order}`);
    const text = JSON.stringify(rows);
    writeFileSync(join(work, 'tables', `${name}.json`), text);
    manifest.tables[name] = { rows: rows.length, sha256: sha256(text) };
  }

  const schemaQueries = {
    functions: `SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS definition
                FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' ORDER BY 1`,
    views: `SELECT c.relname AS name, c.reloptions AS options, pg_get_viewdef(c.oid, true) AS definition
            FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v' ORDER BY 1`,
    policies: `SELECT tablename, policyname, permissive, roles::text[] AS roles, cmd, qual, with_check
               FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`,
    triggers: `SELECT event_object_table AS table, trigger_name, action_timing, event_manipulation, action_statement
               FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY 1, 2, 4`,
    table_grants: `SELECT c.relname AS name, c.relkind AS kind, c.relacl::text AS acl
                   FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'S') ORDER BY 1`,
    column_grants: `SELECT table_name, column_name, grantee, privilege_type FROM information_schema.column_privileges
                    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') ORDER BY 1, 2, 3, 4`,
    function_grants: `SELECT p.oid::regprocedure::text AS signature, p.proacl::text AS acl, p.proconfig AS config
                      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`,
    constraints: `SELECT conrelid::regclass::text AS table, conname, pg_get_constraintdef(oid) AS definition
                  FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`,
  };
  for (const [name, sql] of Object.entries(schemaQueries)) {
    const { rows } = await client.query(sql);
    const text = JSON.stringify(rows, null, 1);
    writeFileSync(join(work, 'schema', `${name}.json`), text);
    manifest.schema[name] = { rows: rows.length, sha256: sha256(text) };
  }
  await client.query('ROLLBACK');
} finally {
  await client.end();
}

writeFileSync(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Verify what was written before zipping: every file re-read and re-hashed.
for (const [name, meta] of Object.entries(manifest.tables)) {
  const text = readFileSync(join(work, 'tables', `${name}.json`), 'utf8');
  if (sha256(text) !== meta.sha256 || JSON.parse(text).length !== meta.rows) throw new Error(`verification failed for ${name}`);
}

const zipPath = `${work}.zip`;
// Windows ships bsdtar (zip-capable); a GNU tar earlier on PATH would treat 'C:' as a remote host.
const tarBin = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
execFileSync(tarBin, ['-a', '-c', '-f', zipPath, '-C', work, '.'], { stdio: 'inherit' });
rmSync(work, { recursive: true, force: true });

const totalRows = Object.values(manifest.tables).reduce((s, t) => s + t.rows, 0);
console.log(`Snapshot written: ${zipPath}`);
console.log(`${Object.keys(manifest.tables).length} tables, ${totalRows} rows, ${manifest.schema.functions.rows} functions, ${manifest.schema.policies.rows} policies`);
console.log(`manifest sha256: ${sha256(JSON.stringify(manifest, null, 2))}`);
