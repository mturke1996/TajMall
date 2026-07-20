#!/usr/bin/env node
/**
 * Emergency restore of a Fluxen cold-backup ZIP into a Postgres / Supabase database.
 *
 * Usage:
 *   node scripts/restore-cold-backup.mjs path/to/fluxen-cold-backup-XXXX.zip
 *
 * Requires env:
 *   DIRECT_URL  — Postgres connection string (direct, not pooler)
 *
 * Notes:
 * - This is a migration/disaster path only — not used at runtime.
 * - Apply schema migrations on the target project BEFORE running this script.
 * - `profiles.id` references auth.users — create matching Auth users first, or
 *   expect FK errors on profiles (other tables may still restore).
 * - Prefer restoring onto an EMPTY / new database.
 */

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';

const TABLE_ORDER = [
  'profiles',
  'branches',
  'categories',
  'cashboxes',
  'contacts',
  'fiscal_periods',
  'account_mappings',
  'mall_units',
  'lease_contracts',
  'transactions',
  'cash_transfers',
  'journal_entries',
  'journal_lines',
  'journal_reference_sequences',
  'journal_form_drafts',
  'transaction_form_drafts',
  'tenant_charges',
  'tenant_charge_allocations',
  'tenant_rent_journal_links',
  'tenant_rent_exempt_months',
  'disbursement_vouchers',
  'disbursement_voucher_lines',
  'budgets',
  'audit_log',
  'app_notifications',
];

const CONFLICT_KEY = {
  journal_reference_sequences: 'year',
};

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function extractZip(zipPath, destDir) {
  execFileSync('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'inherit' });
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

async function upsertRows(client, table, rows) {
  if (!rows.length) return 0;
  const conflict = CONFLICT_KEY[table] ?? 'id';
  let inserted = 0;

  for (const row of rows) {
    const keys = Object.keys(row);
    if (!keys.length) continue;
    if (!(conflict in row)) {
      console.warn(`  skip ${table}: missing conflict key "${conflict}"`);
      continue;
    }
    const cols = keys.map(quoteIdent).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const updates = keys
      .filter((k) => k !== conflict)
      .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
      .join(', ');
    const sql = updates
      ? `INSERT INTO public.${quoteIdent(table)} (${cols}) VALUES (${placeholders})
         ON CONFLICT (${quoteIdent(conflict)}) DO UPDATE SET ${updates}`
      : `INSERT INTO public.${quoteIdent(table)} (${cols}) VALUES (${placeholders})
         ON CONFLICT (${quoteIdent(conflict)}) DO NOTHING`;
    const values = keys.map((k) => {
      const v = row[k];
      if (v !== null && typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    try {
      await client.query(sql, values);
      inserted += 1;
    } catch (err) {
      console.warn(`  ${table} row failed: ${err.message}`);
    }
  }
  return inserted;
}

async function main() {
  const zipArg = process.argv[2];
  if (!zipArg) {
    die('Usage: node scripts/restore-cold-backup.mjs <cold-backup.zip>');
  }
  const zipPath = resolve(zipArg);
  if (!existsSync(zipPath)) die(`File not found: ${zipPath}`);

  const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!directUrl) {
    die('Set DIRECT_URL (or DATABASE_URL) to the target Postgres connection string.');
  }

  const work = mkdtempSync(join(tmpdir(), 'fluxen-cold-restore-'));
  console.log(`Extracting to ${work} …`);
  try {
    extractZip(zipPath, work);
  } catch (err) {
    rmSync(work, { recursive: true, force: true });
    die(`Failed to extract ZIP (need tar): ${err.message}`);
  }

  const manifestPath = join(work, 'manifest.json');
  if (!existsSync(manifestPath)) {
    rmSync(work, { recursive: true, force: true });
    die('manifest.json missing — not a Fluxen cold backup?');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  console.log(
    `Backup ${manifest.id ?? '?'} · ${manifest.createdAt ?? '?'} · format ${manifest.format ?? '?'}`,
  );

  const tablesDir = join(work, 'tables');
  const available = existsSync(tablesDir)
    ? new Set(readdirSync(tablesDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')))
    : new Set();

  const client = new pg.Client({ connectionString: directUrl });
  await client.connect();
  console.log('Connected. Restoring tables…');

  try {
    await client.query('BEGIN');
    // Temporarily defer FK checks within the transaction where supported.
    await client.query('SET CONSTRAINTS ALL DEFERRED').catch(() => {});

    for (const table of TABLE_ORDER) {
      if (!available.has(table)) {
        console.log(`- ${table}: (absent in archive)`);
        continue;
      }
      const rows = JSON.parse(readFileSync(join(tablesDir, `${table}.json`), 'utf8'));
      if (!Array.isArray(rows)) {
        console.warn(`- ${table}: invalid JSON array, skipped`);
        continue;
      }
      const n = await upsertRows(client, table, rows);
      console.log(`- ${table}: ${n}/${rows.length}`);
    }

    await client.query('COMMIT');
    console.log('Done. Verify data in the target project before switching production URLs.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
