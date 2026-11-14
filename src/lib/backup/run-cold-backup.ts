import type { SupabaseClient } from '@supabase/supabase-js';
import { collectColdBackupSnapshot } from './collect-snapshot';
import { getShellInfo, isShellCompatible, isTauriDesktop, saveColdBackup, type BackupInfo } from './tauri-bridge';

export type RunColdBackupResult =
  | { ok: true; info: BackupInfo }
  | { ok: false; error: string };

/**
 * Collects a full Supabase snapshot and writes a cold SQLite+ZIP backup
 * via Tauri. Does not change runtime data access — Supabase remains primary.
 */
export async function runColdBackup(
  supabase: SupabaseClient,
  role: string | null | undefined,
  appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '2.0.0',
): Promise<RunColdBackupResult> {
  if (!isTauriDesktop()) {
    return {
      ok: false,
      error: 'النسخ الاحتياطي المحلي متاح فقط من تطبيق سطح المكتب (Taj Mall).',
    };
  }

  // A shell older than this page's IPC contract is told to update; a shell that predates the handshake
  // (null) still works, so an old desktop app never loses its backups just because it is old.
  if (!isShellCompatible(await getShellInfo())) {
    return {
      ok: false,
      error: 'إصدار تطبيق سطح المكتب أقدم من المطلوب لهذه النسخة — حدّث التطبيق ثم أعد المحاولة.',
    };
  }

  const collected = await collectColdBackupSnapshot(supabase, role, appVersion);
  if (!collected.ok) {
    return { ok: false, error: collected.error };
  }

  try {
    const info = await saveColdBackup(collected.snapshot);
    return { ok: true, info };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldRunAutoBackup(lastCreatedAt: string | null | undefined): boolean {
  if (!lastCreatedAt) return true;
  const ts = Date.parse(lastCreatedAt);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts >= AUTO_BACKUP_INTERVAL_MS;
}
