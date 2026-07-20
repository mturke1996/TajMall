import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeRole } from '@/lib/permissions';
import { COLD_BACKUP_TABLES, PAGE_SIZE, type ColdBackupTable } from './tables';

export type ColdBackupSnapshot = {
  appVersion: string;
  source: string;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export type CollectSnapshotResult =
  | { ok: true; snapshot: ColdBackupSnapshot; tableCounts: Record<string, number> }
  | { ok: false; error: string };

async function fetchAllRows(
  supabase: SupabaseClient,
  table: ColdBackupTable,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, to);

    if (error) {
      // Missing table / no SELECT grant — skip with empty set rather than aborting
      // the whole backup (draft tables may be absent in older projects).
      if (
        error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /does not exist|schema cache/i.test(error.message)
      ) {
        return rows;
      }
      throw new Error(`${table}: ${error.message}`);
    }

    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * Pulls every business table visible to the signed-in owner/admin via RLS.
 * High-fidelity: select('*') for each row, paginated.
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

  try {
    for (const table of COLD_BACKUP_TABLES) {
      const rows = await fetchAllRows(supabase, table);
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
    },
  };
}
