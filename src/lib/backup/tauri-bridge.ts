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
  /** Digest of the data (per-table hashes). Present in every backup. */
  checksum: string;
  /** SHA-256 of the finished ZIP file. Absent in backups made by older shells. */
  zipSha256?: string;
  /** Tables that were not in the database when this backup ran (a migration not applied yet). */
  skippedTables?: string[];
};

/** What the installed desktop shell reports about itself (see `get_shell_info`). */
export type ShellInfo = {
  shellVersion: string;
  /** Version of the IPC contract between the shell and this web app. */
  ipcProtocol: number;
  commands: string[];
};

/** The IPC contract version this web app was written for. Raise it together with the shell. */
export const WEB_IPC_PROTOCOL = 1;

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
    skippedTables?: string[];
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

/**
 * Asks the installed shell which IPC contract it speaks. Returns null for a shell older than this command
 * (installed before the handshake existed): callers treat that as "legacy" and carry on, never as an error,
 * so an old desktop app keeps taking backups until it is updated.
 */
export async function getShellInfo(): Promise<ShellInfo | null> {
  try {
    return await invoke<ShellInfo>('get_shell_info');
  } catch {
    return null;
  }
}

/** True when the shell can do everything this web app needs. A legacy shell (null) is allowed. */
export function isShellCompatible(info: ShellInfo | null): boolean {
  return info === null || info.ipcProtocol >= WEB_IPC_PROTOCOL;
}
