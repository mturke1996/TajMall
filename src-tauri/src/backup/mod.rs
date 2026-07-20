//! Cold local backups — written to disk for disaster recovery only.
//! The running app never reads from these files during normal operation.

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const INDEX_FILE: &str = "index.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColdBackupSnapshot {
  pub app_version: String,
  pub source: String,
  pub created_at: Option<String>,
  pub tables: Map<String, Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
  pub id: String,
  pub created_at: String,
  pub app_version: String,
  pub source: String,
  pub table_counts: Map<String, Value>,
  pub total_rows: u64,
  pub sqlite_path: String,
  pub zip_path: String,
  pub sqlite_bytes: u64,
  pub zip_bytes: u64,
  pub checksum: String,
}

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("app_data_dir: {e}"))?
    .join("backups");
  fs::create_dir_all(&dir).map_err(|e| format!("create backups dir: {e}"))?;
  Ok(dir)
}

fn index_path(dir: &Path) -> PathBuf {
  dir.join(INDEX_FILE)
}

fn read_index(dir: &Path) -> Vec<BackupInfo> {
  let path = index_path(dir);
  let Ok(raw) = fs::read_to_string(&path) else {
    return Vec::new();
  };
  serde_json::from_str(&raw).unwrap_or_default()
}

fn write_index(dir: &Path, items: &[BackupInfo]) -> Result<(), String> {
  let raw = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
  fs::write(index_path(dir), raw).map_err(|e| format!("write index: {e}"))
}

fn file_sha256(path: &Path) -> Result<String, String> {
  let mut file = File::open(path).map_err(|e| format!("open for hash: {e}"))?;
  let mut hasher = Sha256::new();
  let mut buf = [0u8; 64 * 1024];
  loop {
    let n = file.read(&mut buf).map_err(|e| format!("read for hash: {e}"))?;
    if n == 0 {
      break;
    }
    hasher.update(&buf[..n]);
  }
  Ok(format!("{:x}", hasher.finalize()))
}

fn table_row_count(value: &Value) -> u64 {
  value.as_array().map(|a| a.len() as u64).unwrap_or(0)
}

fn write_sqlite(
  path: &Path,
  id: &str,
  created_at: &str,
  snapshot: &ColdBackupSnapshot,
  table_counts: &Map<String, Value>,
  checksum_placeholder: &str,
) -> Result<(), String> {
  if path.exists() {
    fs::remove_file(path).map_err(|e| format!("remove old sqlite: {e}"))?;
  }
  let conn = Connection::open(path).map_err(|e| format!("open sqlite: {e}"))?;

  conn
    .execute_batch(
      "CREATE TABLE backup_meta (
         id TEXT PRIMARY KEY,
         created_at TEXT NOT NULL,
         app_version TEXT NOT NULL,
         source TEXT NOT NULL,
         table_counts TEXT NOT NULL,
         checksum TEXT NOT NULL
       );
       CREATE TABLE table_rows (
         table_name TEXT NOT NULL,
         row_index INTEGER NOT NULL,
         payload TEXT NOT NULL,
         PRIMARY KEY (table_name, row_index)
       );",
    )
    .map_err(|e| format!("create schema: {e}"))?;

  let counts_json = serde_json::to_string(table_counts).map_err(|e| e.to_string())?;
  conn
    .execute(
      "INSERT INTO backup_meta (id, created_at, app_version, source, table_counts, checksum)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      params![
        id,
        created_at,
        snapshot.app_version,
        snapshot.source,
        counts_json,
        checksum_placeholder
      ],
    )
    .map_err(|e| format!("insert meta: {e}"))?;

  let mut insert = conn
    .prepare("INSERT INTO table_rows (table_name, row_index, payload) VALUES (?1, ?2, ?3)")
    .map_err(|e| format!("prepare insert: {e}"))?;

  for (table_name, rows_value) in &snapshot.tables {
    let Some(rows) = rows_value.as_array() else {
      continue;
    };
    for (idx, row) in rows.iter().enumerate() {
      let payload = serde_json::to_string(row).map_err(|e| e.to_string())?;
      insert
        .execute(params![table_name, idx as i64, payload])
        .map_err(|e| format!("insert row {table_name}[{idx}]: {e}"))?;
    }
  }

  Ok(())
}

fn write_zip(
  path: &Path,
  id: &str,
  created_at: &str,
  snapshot: &ColdBackupSnapshot,
  table_counts: &Map<String, Value>,
  total_rows: u64,
  checksum: &str,
) -> Result<(), String> {
  let file = File::create(path).map_err(|e| format!("create zip: {e}"))?;
  let mut zip = ZipWriter::new(file);
  let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

  let manifest = json!({
    "id": id,
    "createdAt": created_at,
    "appVersion": snapshot.app_version,
    "source": snapshot.source,
    "format": "fluxen-cold-backup-v1",
    "tableCounts": table_counts,
    "totalRows": total_rows,
    "checksum": checksum,
    "note": "Cold backup for emergency restore / re-hosting only. Not used at runtime."
  });
  zip
    .start_file("manifest.json", opts)
    .map_err(|e| format!("zip manifest: {e}"))?;
  zip
    .write_all(serde_json::to_string_pretty(&manifest).unwrap().as_bytes())
    .map_err(|e| format!("zip write manifest: {e}"))?;

  for (table_name, rows_value) in &snapshot.tables {
    let file_name = format!("tables/{table_name}.json");
    zip
      .start_file(&file_name, opts)
      .map_err(|e| format!("zip start {file_name}: {e}"))?;
    let body = serde_json::to_string_pretty(rows_value).map_err(|e| e.to_string())?;
    zip
      .write_all(body.as_bytes())
      .map_err(|e| format!("zip write {file_name}: {e}"))?;
  }

  zip.finish().map_err(|e| format!("zip finish: {e}"))?;
  Ok(())
}

#[tauri::command]
pub fn save_cold_backup(app: AppHandle, snapshot: ColdBackupSnapshot) -> Result<BackupInfo, String> {
  let dir = backups_dir(&app)?;
  let created_at = snapshot
    .created_at
    .clone()
    .unwrap_or_else(|| Utc::now().to_rfc3339());
  let id = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();

  let mut table_counts = Map::new();
  let mut total_rows: u64 = 0;
  for (name, rows) in &snapshot.tables {
    let count = table_row_count(rows);
    table_counts.insert(name.clone(), json!(count));
    total_rows += count;
  }

  let sqlite_path = dir.join(format!("{id}.sqlite"));
  let zip_path = dir.join(format!("{id}.zip"));

  write_sqlite(
    &sqlite_path,
    &id,
    &created_at,
    &snapshot,
    &table_counts,
    "pending",
  )?;

  let checksum = file_sha256(&sqlite_path)?;
  // Persist checksum into meta for integrity checks when inspecting the file.
  {
    let conn = Connection::open(&sqlite_path).map_err(|e| format!("reopen sqlite: {e}"))?;
    conn
      .execute(
        "UPDATE backup_meta SET checksum = ?1 WHERE id = ?2",
        params![checksum, id],
      )
      .map_err(|e| format!("update checksum: {e}"))?;
  }

  write_zip(
    &zip_path,
    &id,
    &created_at,
    &snapshot,
    &table_counts,
    total_rows,
    &checksum,
  )?;

  let info = BackupInfo {
    id: id.clone(),
    created_at,
    app_version: snapshot.app_version,
    source: snapshot.source,
    table_counts,
    total_rows,
    sqlite_path: sqlite_path.to_string_lossy().into_owned(),
    zip_path: zip_path.to_string_lossy().into_owned(),
    sqlite_bytes: fs::metadata(&sqlite_path).map(|m| m.len()).unwrap_or(0),
    zip_bytes: fs::metadata(&zip_path).map(|m| m.len()).unwrap_or(0),
    checksum,
  };

  let mut index = read_index(&dir);
  index.retain(|b| b.id != id);
  index.insert(0, info.clone());
  // Keep the newest 60 cold backups on disk index (files remain until manually deleted).
  if index.len() > 60 {
    index.truncate(60);
  }
  write_index(&dir, &index)?;

  Ok(info)
}

#[tauri::command]
pub fn list_cold_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
  let dir = backups_dir(&app)?;
  Ok(read_index(&dir))
}

#[tauri::command]
pub fn reveal_backups_folder(app: AppHandle) -> Result<String, String> {
  let dir = backups_dir(&app)?;
  let path_str = dir.to_string_lossy().into_owned();

  #[cfg(target_os = "windows")]
  {
    std::process::Command::new("explorer")
      .arg(&dir)
      .spawn()
      .map_err(|e| format!("open explorer: {e}"))?;
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&dir)
      .spawn()
      .map_err(|e| format!("open finder: {e}"))?;
  }
  #[cfg(all(unix, not(target_os = "macos")))]
  {
    std::process::Command::new("xdg-open")
      .arg(&dir)
      .spawn()
      .map_err(|e| format!("xdg-open: {e}"))?;
  }

  Ok(path_str)
}

#[tauri::command]
pub fn export_backup_copy(app: AppHandle, id: String) -> Result<Option<String>, String> {
  let dir = backups_dir(&app)?;
  let src = dir.join(format!("{id}.zip"));
  if !src.exists() {
    return Err(format!("backup zip not found: {id}"));
  }

  let dest = rfd::FileDialog::new()
    .set_title("حفظ نسخة احتياطية")
    .set_file_name(format!("fluxen-cold-backup-{id}.zip"))
    .add_filter("Fluxen Cold Backup", &["zip"])
    .save_file();

  let Some(dest) = dest else {
    return Ok(None);
  };

  fs::copy(&src, &dest).map_err(|e| format!("copy backup: {e}"))?;
  Ok(Some(dest.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn get_backups_dir(app: AppHandle) -> Result<String, String> {
  Ok(backups_dir(&app)?.to_string_lossy().into_owned())
}
