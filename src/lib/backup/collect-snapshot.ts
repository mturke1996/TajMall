import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/permissions';
import {
  COLD_BACKUP_TABLES,
  PAGE_SIZE,
  coldBackupOrderBy,
  coldBackupSelect,
  type ColdBackupTable,
} from './tables';

export type ColdBackupSnapshot = {
  appVersion: string;
  source: string;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  /** Listed tables that were not in the database (a migration not applied yet): named, never hidden. */
  skippedTables: string[];
};

export type CollectSnapshotResult =
  | { ok: true; snapshot: ColdBackupSnapshot; tableCounts: Record<string, number> }
  | { ok: false; error: string };

function isMissingTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|schema cache/i.test(error.message)
  );
}

/**
 * Two rows with the same key in one table means paging read a row twice (and therefore skipped another):
 * the backup would look complete and not be. Stop instead of writing it.
 */
function assertUniqueKeys(table: string, key: string, rows: Record<string, unknown>[]): void {
  const seen = new Set<unknown>();
  for (const row of rows) {
    const value = row[key];
    if (seen.has(value)) {
      throw new Error(`${table}: القيمة ${String(value)} مكررة في عمود ${key} — تغيّرت البيانات أثناء النسخ، أعد المحاولة`);
    }
    seen.add(value);
  }
}

async function fetchAllRows(
  supabase: SupabaseClient,
  table: ColdBackupTable,
): Promise<{ rows: Record<string, unknown>[]; missing: boolean }> {
  const rows: Record<string, unknown>[] = [];
  const orderBy = coldBackupOrderBy(table);
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(coldBackupSelect(table))
      .order(orderBy, { ascending: true })
      .range(from, to);

    if (error) {
      // A table that does not exist yet (draft/optional migration) is skipped by name; anything else —
      // above all "permission denied" — stops the backup, because a quiet gap here is lost data.
      if (isMissingTable(error)) return { rows: [], missing: true };
      throw new Error(`${table}: ${error.message}`);
    }

    const batch = ((data ?? []) as unknown) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  assertUniqueKeys(table, orderBy, rows);
  return { rows, missing: false };
}

/**
 * Pulls every business table visible to the signed-in owner/admin via RLS.
 * High-fidelity snapshot per table, paginated in primary-key order. Most tables use `*`; contacts
 * uses an explicit column list (portal_token is excluded — regenerate via RPC after restore).
 */
export async function collectColdBackupSnapshot(
  supabase: SupabaseClient,
  role: string | null | undefined,
  appVersion = '2.0.0',
): Promise<CollectSnapshotResult> {
  const normalized = normalizeRole(role);
  if (normalized !== 'owner' && normalized !== 'admin') {
    return {
      ok: false,
      error: 'النسخ الاحتياطي المحلي متاح لمديري النظام (owner / admin) فقط.',
    };
  }

  const tables: Record<string, Record<string, unknown>[]> = {};
  const tableCounts: Record<string, number> = {};
  const skippedTables: string[] = [];

  try {
    for (const table of COLD_BACKUP_TABLES) {
      const { rows, missing } = await fetchAllRows(supabase, table);
      if (missing) {
        skippedTables.push(table);
        continue;
      }
      tables[table] = rows;
      tableCounts[table] = rows.length;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  return {
    ok: true,
    tableCounts,
    snapshot: {
      appVersion,
      source: 'supabase',
      createdAt: new Date().toISOString(),
      tables,
      skippedTables,
    },
  };
}
