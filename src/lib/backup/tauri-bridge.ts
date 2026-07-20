export type BackupInfo = {
  id: string;
  createdAt: string;
  appVersion: string;
  source: string;
  tableCounts: Record<string, number>;
  totalRows: number;
  sqlitePath: string;
  zipPath: string;
  sqliteBytes: number;
  zipBytes: number;
  checksum: string;
};

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } } })
    .__TAURI__;
  return tauri?.core?.invoke ?? null;
}

/** True when the UI is running inside the Tauri desktop shell. */
export function isTauriDesktop(): boolean {
  return getInvoke() !== null;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const fn = getInvoke();
  if (!fn) {
    throw new Error('أوامر سطح المكتب غير متاحة خارج تطبيق Tauri.');
  }
  return (await fn(cmd, args)) as T;
}

export async function saveColdBackup(
  snapshot: {
    appVersion: string;
    source: string;
    createdAt: string;
    tables: Record<string, Record<string, unknown>[]>;
  },
): Promise<BackupInfo> {
  return invoke<BackupInfo>('save_cold_backup', { snapshot });
}

export async function listColdBackups(): Promise<BackupInfo[]> {
  return invoke<BackupInfo[]>('list_cold_backups');
}

export async function revealBackupsFolder(): Promise<string> {
  return invoke<string>('reveal_backups_folder');
}

export async function exportBackupCopy(id: string): Promise<string | null> {
  return invoke<string | null>('export_backup_copy', { id });
}

export async function getBackupsDir(): Promise<string> {
  return invoke<string>('get_backups_dir');
}
