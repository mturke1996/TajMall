#!/usr/bin/env node
/**
 * Emergency restore of a Fluxen cold-backup ZIP into a Postgres / Supabase database.
 *
 *   node scripts/restore-cold-backup.mjs <backup.zip> [--dry-run] [--allow-partial] [--erase-existing-data]
 *
 * Environment:
 *   DIRECT_URL (or DATABASE_URL)  Postgres connection string, direct connection (not the pooler).
 *
 * Read this before running:
 *  - Restore onto a NEW, BLANK project after applying the schema migrations. The tool empties the restored
 *    tables first (a fresh project already holds seed categories/cashboxes) and REFUSES to run when the
 *    database already contains transactions, journal entries or contacts, unless --erase-existing-data.
 *  - `profiles.id` references auth.users: create the matching Auth users first, or those rows are reported
 *    as failures.
 *  - Run with --dry-run first. It performs the whole load inside a transaction and rolls it back, so every
 *    problem shows up without touching the database.
 *  - Any failure rolls the WHOLE restore back (exit code 2). --allow-partial commits what loaded and lists
 *    the failures (exit code 3); use it only when you know what is missing.
 *
 * Exit codes: 0 restored · 1 usage / file / connection error · 2 restore failed and rolled back · 3 partial.
 * The engine itself is scripts/lib/cold-restore.mjs (tested by `npm run test:cold-restore`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { RestoreError, parseArchive, restoreArchive } from './lib/cold-restore.mjs';
import { ZipError } from './lib/zip-reader.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const files = args.filter((a) => !a.startsWith('--'));
const KNOWN = new Set(['--dry-run', '--allow-partial', '--erase-existing-data']);

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

for (const flag of flags) if (!KNOWN.has(flag)) die(`خيار غير معروف: ${flag}`);
if (files.length !== 1) {
  die('Usage: node scripts/restore-cold-backup.mjs <backup.zip> [--dry-run] [--allow-partial] [--erase-existing-data]');
}

const zipPath = resolve(files[0]);
if (!existsSync(zipPath)) die(`File not found: ${zipPath}`);

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) die('Set DIRECT_URL (or DATABASE_URL) to the target Postgres connection string.');

let archive;
try {
  archive = parseArchive(readFileSync(zipPath));
} catch (error) {
  if (error instanceof RestoreError || error instanceof ZipError) die(`الأرشيف مرفوض: ${error.message}`);
  throw error;
}

const { manifest } = archive;
console.log(`Backup ${manifest.id ?? '?'} · ${manifest.createdAt ?? '?'} · app ${manifest.appVersion ?? '?'}`);
console.log(`Archive verified: ${archive.tables.size} tables, ${[...archive.tables.values()].reduce((n, r) => n + r.length, 0)} rows.`);
if (!manifest.tableSha256) console.log('Note: this archive has no per-table SHA-256 (older app version); ZIP CRC and row counts were checked.');

// Supabase needs TLS; honour an explicit sslmode in the URL, skip it for localhost, otherwise require it
// without verifying the certificate chain (set PGSSLROOTCERT-style verification yourself for strict checks).
const host = (() => {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '';
  }
})();
const hasSslMode = /[?&]sslmode=/.test(connectionString);
const ssl = hasSslMode || ['localhost', '127.0.0.1', '::1'].includes(host) ? undefined : { rejectUnauthorized: false };

const client = new pg.Client({ connectionString, ssl });
try {
  await client.connect();
} catch (error) {
  die(`تعذّر الاتصال بقاعدة البيانات: ${error.message}`);
}

let exitCode = 0;
try {
  console.log(flags.has('--dry-run') ? 'Dry run: nothing will be kept.' : 'Restoring…');
  const result = await restoreArchive(client, archive, {
    dryRun: flags.has('--dry-run'),
    allowPartial: flags.has('--allow-partial'),
    eraseExisting: flags.has('--erase-existing-data'),
    log: (line) => console.log(line),
  });
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (result.failures.length) {
    console.warn(`\n${result.failureCount} failure(s), restored partially:`);
    for (const f of result.failures) console.warn(`  ${f.table} [${f.kind}] ${f.message}${f.key ? ` ${JSON.stringify(f.key)}` : ''}`);
    exitCode = 3;
  }
  console.log(
    result.dryRun
      ? '\nDry run finished and was rolled back. If it shows no failures, run again without --dry-run.'
      : '\nDone. Verify the data in the target project before switching production to it.',
  );
} catch (error) {
  if (error instanceof RestoreError) {
    console.error(`\nالاستعادة لم تتم: ${error.message}`);
    for (const f of error.details?.failures ?? []) {
      console.error(`  ${f.table} [${f.kind}] ${f.message}${f.key ? ` ${JSON.stringify(f.key)}` : ''}`);
    }
    exitCode = 2;
  } else {
    console.error(error);
    exitCode = 1;
  }
} finally {
  await client.end().catch(() => {});
}
process.exit(exitCode);
