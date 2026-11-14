//! Cold local backups — written to disk for disaster recovery only.
//! The running app never reads from these files during normal operation.
//!
//! Everything the web page sends here is untrusted input (the shell shows a hosted site), so names and ids
//! are validated before they touch a path, files are written under a temporary name and renamed only when
//! complete, and the index is replaced atomically. The ZIP is what `scripts/restore-cold-backup.mjs` reads:
//! its manifest carries a SHA-256 per table so a damaged or edited archive is refused before any restore.

use chrono::{DateTime, Utc};
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
/// Manifest `format`; the restore tool refuses anything else.
pub const ARCHIVE_FORMAT: &str = "fluxen-cold-backup-v1";
/// Backups listed in the index. Older files stay on disk (deleting a backup is the owner's decision).
const KEEP_IN_INDEX: usize = 60;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColdBackupSnapshot {
  pub app_version: String,
  pub source: String,
  pub created_at: Option<String>,
  pub tables: Map<String, Value>,
  /// Tables the web app could not read because they do not exist yet (named, never hidden).
  #[serde(default)]
  pub skipped_tables: Vec<String>,
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
  /// Digest of the DATA (per-table hashes), written inside both files. Not a hash of a file.
  pub checksum: String,
  /// SHA-256 of the finished ZIP file itself, for file-level integrity checks.
  #[serde(default)]
  pub zip_sha256: String,
  #[serde(default)]
  pub skipped_tables: Vec<String>,
}

// ── validation of everything that comes from the web page ──────────────────────────────────────────────

/// `20260131T235959Z`, optionally followed by `-N` (1–3 digits) when two backups land in the same second.
/// It is the only shape of id the app creates, so it is the only one accepted back.
pub fn is_valid_backup_id(id: &str) -> bool {
  let (base, suffix) = match id.split_once('-') {
    Some((base, suffix)) => (base, Some(suffix)),
    None => (id, None),
  };
  let b = base.as_bytes();
  let base_ok = b.len() == 16
    && b[..8].iter().all(|c| c.is_ascii_digit())
    && b[8] == b'T'
    && b[9..15].iter().all(|c| c.is_ascii_digit())
    && b[15] == b'Z';
  let suffix_ok = suffix.map_or(true, |s| !s.is_empty() && s.len() <= 3 && s.bytes().all(|c| c.is_ascii_digit()));
  base_ok && suffix_ok
}

/// A Postgres table name as this app uses them: lower-case letters, digits and `_`, starting with a letter.
pub fn is_valid_table_name(name: &str) -> bool {
  let b = name.as_bytes();
  !b.is_empty()
    && b.len() <= 63
    && b[0].is_ascii_lowercase()
    && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_')
}

/// The ZIP of backup `id` inside `dir`, or an error. Never builds a path from an unchecked string.
pub fn resolve_backup_zip(dir: &Path, id: &str) -> Result<PathBuf, String> {
  if !is_valid_backup_id(id) {
    return Err("معرّف النسخة الاحتياطية غير صالح".to_string());
  }
  let path = dir.join(format!("{id}.zip"));
  if !path.is_file() {
    return Err(format!("backup zip not found: {id}"));
  }
  Ok(path)
}

// ── files ──────────────────────────────────────────────────────────────────────────────────────────────

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

/// Reads the index. An unreadable index is moved aside (kept as evidence) instead of being silently
/// overwritten by the next backup, which would forget every earlier entry.
fn read_index(dir: &Path) -> Vec<BackupInfo> {
  let path = index_path(dir);
  let Ok(raw) = fs::read_to_string(&path) else {
    return Vec::new();
  };
  match serde_json::from_str::<Vec<BackupInfo>>(&raw) {
    Ok(items) => items,
    Err(_) => {
      let _ = fs::rename(&path, dir.join("index.corrupt.json"));
      Vec::new()
    }
  }
}

/// Writes `bytes` to a temporary file, flushes it to disk, then renames it over `path`: a crash leaves
/// either the old file or the new one, never a half-written one.
fn write_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
  let mut tmp = path.as_os_str().to_owned();
  tmp.push(".tmp");
  let tmp = PathBuf::from(tmp);
  {
    let mut file = File::create(&tmp).map_err(|e| format!("create {}: {e}", tmp.display()))?;
    file.write_all(bytes).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    file.sync_all().map_err(|e| format!("sync {}: {e}", tmp.display()))?;
  }
  fs::rename(&tmp, path).map_err(|e| {
    let _ = fs::remove_file(&tmp);
    format!("replace {}: {e}", path.display())
  })
}

fn write_index(dir: &Path, items: &[BackupInfo]) -> Result<(), String> {
  let raw = serde_json::to_string_pretty(items).map_err(|e| e.to_string())?;
  write_atomically(&index_path(dir), raw.as_bytes())
}

fn sha256_hex(bytes: &[u8]) -> String {
  format!("{:x}", Sha256::digest(bytes))
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

fn backup_files_exist(dir: &Path, id: &str) -> bool {
  dir.join(format!("{id}.zip")).exists() || dir.join(format!("{id}.sqlite")).exists()
}

/// The id is the UTC time to the second. Two backups in the same second must not overwrite each other.
fn allocate_id(dir: &Path, now: &DateTime<Utc>) -> Result<String, String> {
  let base = now.format("%Y%m%dT%H%M%SZ").to_string();
  if !backup_files_exist(dir, &base) {
    return Ok(base);
  }
  for n in 1..=999 {
    let candidate = format!("{base}-{n}");
    if !backup_files_exist(dir, &candidate) {
      return Ok(candidate);
    }
  }
  Err("too many backups created in the same second".to_string())
}

/// Digest of the data itself: SHA-256 over `table:hash` lines in table-name order.
fn content_digest(tables: &[(String, String, String)]) -> String {
  let mut hasher = Sha256::new();
  for (name, _body, hash) in tables {
    hasher.update(format!("{name}:{hash}\n").as_bytes());
  }
  format!("{:x}", hasher.finalize())
}

fn write_sqlite(
  path: &Path,
  id: &str,
  created_at: &str,
  snapshot: &ColdBackupSnapshot,
  table_counts: &Map<String, Value>,
  content_sha256: &str,
) -> Result<(), String> {
  if path.exists() {
    fs::remove_file(path).map_err(|e| format!("remove old sqlite: {e}"))?;
  }
  let mut conn = Connection::open(path).map_err(|e| format!("open sqlite: {e}"))?;

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
  // one transaction: thousands of autocommitted inserts would each wait for the disk
  let tx = conn.transaction().map_err(|e| format!("begin: {e}"))?;
  tx.execute(
    "INSERT INTO backup_meta (id, created_at, app_version, source, table_counts, checksum)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    params![id, created_at, snapshot.app_version, snapshot.source, counts_json, content_sha256],
  )
  .map_err(|e| format!("insert meta: {e}"))?;

  {
    let mut insert = tx
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
  }
  tx.commit().map_err(|e| format!("commit: {e}"))?;
  Ok(())
}

#[allow(clippy::too_many_arguments)]
fn write_zip(
  path: &Path,
  id: &str,
  created_at: &str,
  snapshot: &ColdBackupSnapshot,
  table_counts: &Map<String, Value>,
  total_rows: u64,
  content_sha256: &str,
  bodies: &[(String, String, String)],
) -> Result<(), String> {
  let file = File::create(path).map_err(|e| format!("create zip: {e}"))?;
  let mut zip = ZipWriter::new(file);
  let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

  let table_hashes: Map<String, Value> = bodies
    .iter()
    .map(|(name, _body, hash)| (name.clone(), Value::String(hash.clone())))
    .collect();
  let manifest = json!({
    "id": id,
    "createdAt": created_at,
    "appVersion": snapshot.app_version,
    "source": snapshot.source,
    "format": ARCHIVE_FORMAT,
    "tableCounts": table_counts,
    "tableSha256": table_hashes,
    "skippedTables": snapshot.skipped_tables,
    "totalRows": total_rows,
    "checksum": content_sha256,
    "note": "Cold backup for emergency restore / re-hosting only. Not used at runtime."
  });
  zip
    .start_file("manifest.json", opts)
    .map_err(|e| format!("zip manifest: {e}"))?;
  zip
    .write_all(serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?.as_bytes())
    .map_err(|e| format!("zip write manifest: {e}"))?;

  for (table_name, body, _hash) in bodies {
    let file_name = format!("tables/{table_name}.json");
    zip
      .start_file(&file_name, opts)
      .map_err(|e| format!("zip start {file_name}: {e}"))?;
    zip
      .write_all(body.as_bytes())
      .map_err(|e| format!("zip write {file_name}: {e}"))?;
  }

  let file = zip.finish().map_err(|e| format!("zip finish: {e}"))?;
  file.sync_all().map_err(|e| format!("zip sync: {e}"))?;
  Ok(())
}

/// Writes one backup (SQLite + ZIP) into `dir` and records it in the index. `now` is a parameter so the
/// behaviour is testable without a clock.
pub fn save_snapshot_in(dir: &Path, snapshot: ColdBackupSnapshot, now: DateTime<Utc>) -> Result<BackupInfo, String> {
  // 1) validate and serialise every table once; the same bytes are hashed and written
  let mut bodies: Vec<(String, String, String)> = Vec::new();
  let mut table_counts = Map::new();
  let mut total_rows: u64 = 0;
  for (name, value) in &snapshot.tables {
    if !is_valid_table_name(name) {
      return Err(format!("اسم جدول غير صالح في النسخة: {name:?}"));
    }
    let rows = value
      .as_array()
      .ok_or_else(|| format!("الجدول {name}: المتوقع مصفوفة صفوف"))?;
    if rows.iter().any(|row| !row.is_object()) {
      return Err(format!("الجدول {name}: يحوي عنصراً ليس صفاً"));
    }
    let body = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let hash = sha256_hex(body.as_bytes());
    table_counts.insert(name.clone(), json!(rows.len() as u64));
    total_rows += rows.len() as u64;
    bodies.push((name.clone(), body, hash));
  }
  let content_sha256 = content_digest(&bodies);

  let created_at = snapshot.created_at.clone().unwrap_or_else(|| now.to_rfc3339());
  let id = allocate_id(dir, &now)?;
  let sqlite_final = dir.join(format!("{id}.sqlite"));
  let zip_final = dir.join(format!("{id}.zip"));
  let sqlite_part = dir.join(format!("{id}.sqlite.part"));
  let zip_part = dir.join(format!("{id}.zip.part"));

  // 2) write under temporary names, then rename: the index never lists a half-written backup
  let written = (|| -> Result<(), String> {
    write_sqlite(&sqlite_part, &id, &created_at, &snapshot, &table_counts, &content_sha256)?;
    write_zip(&zip_part, &id, &created_at, &snapshot, &table_counts, total_rows, &content_sha256, &bodies)?;
    fs::rename(&sqlite_part, &sqlite_final).map_err(|e| format!("finalise sqlite: {e}"))?;
    fs::rename(&zip_part, &zip_final).map_err(|e| format!("finalise zip: {e}"))?;
    Ok(())
  })();
  if let Err(error) = written {
    for leftover in [&sqlite_part, &zip_part, &sqlite_final, &zip_final] {
      let _ = fs::remove_file(leftover);
    }
    return Err(error);
  }

  let info = BackupInfo {
    id: id.clone(),
    created_at,
    app_version: snapshot.app_version,
    source: snapshot.source,
    table_counts,
    total_rows,
    sqlite_path: sqlite_final.to_string_lossy().into_owned(),
    zip_path: zip_final.to_string_lossy().into_owned(),
    sqlite_bytes: fs::metadata(&sqlite_final).map(|m| m.len()).unwrap_or(0),
    zip_bytes: fs::metadata(&zip_final).map(|m| m.len()).unwrap_or(0),
    checksum: content_sha256,
    zip_sha256: file_sha256(&zip_final)?,
    skipped_tables: snapshot.skipped_tables,
  };

  let mut index = read_index(dir);
  index.retain(|b| b.id != id);
  index.insert(0, info.clone());
  index.truncate(KEEP_IN_INDEX);
  write_index(dir, &index)?;
  Ok(info)
}

// ── commands (the web page calls these; each needs an explicit permission, see capabilities/) ──────────

#[tauri::command]
pub fn save_cold_backup(app: AppHandle, snapshot: ColdBackupSnapshot) -> Result<BackupInfo, String> {
  save_snapshot_in(&backups_dir(&app)?, snapshot, Utc::now())
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
  let src = resolve_backup_zip(&dir, &id)?;

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

#[cfg(test)]
mod tests {
  use super::*;

  fn sample(tables: Value) -> ColdBackupSnapshot {
    ColdBackupSnapshot {
      app_version: "2.0.0-test".to_string(),
      source: "supabase".to_string(),
      created_at: Some("2026-01-01T00:00:00Z".to_string()),
      tables: tables.as_object().cloned().unwrap_or_default(),
      skipped_tables: vec!["payroll_runs".to_string()],
    }
  }

  fn at(secs: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(secs, 0).expect("valid timestamp")
  }

  #[test]
  fn backup_id_shape() {
    for ok in ["20260131T235959Z", "20260131T235959Z-1", "20260131T235959Z-999"] {
      assert!(is_valid_backup_id(ok), "{ok} should be valid");
    }
    for bad in [
      "",
      "../x",
      "..\\x",
      "a/b",
      "/etc/passwd",
      "C:\\x",
      "20260131T235959Z.zip",
      "20260131T235959",
      "20260131t235959Z",
      "20260131T235959Z-",
      "20260131T235959Z-1000",
      "20260131T235959Z-1a",
      "20260131T235959Z/../x",
      "2026013T2359599Z",
      "20260131T235959Z\0",
    ] {
      assert!(!is_valid_backup_id(bad), "{bad:?} must be rejected");
    }
  }

  #[test]
  fn table_name_shape() {
    for ok in ["transactions", "payroll_run_lines", "a", "t1_x"] {
      assert!(is_valid_table_name(ok), "{ok} should be valid");
    }
    for bad in ["", "Transactions", "1abc", "_x", "a-b", "a b", "../x", "a/b", "a\"b", "تاج", &"a".repeat(64)] {
      assert!(!is_valid_table_name(bad), "{bad:?} must be rejected");
    }
  }

  #[test]
  fn export_never_leaves_the_backups_folder() {
    let dir = tempfile::tempdir().unwrap();
    let outside = dir.path().parent().unwrap().join("secret.zip");
    fs::write(&outside, b"x").unwrap();
    assert!(resolve_backup_zip(dir.path(), "../secret").is_err());
    assert!(resolve_backup_zip(dir.path(), "20260131T235959Z").is_err(), "missing file is an error");
    fs::write(dir.path().join("20260131T235959Z.zip"), b"x").unwrap();
    assert!(resolve_backup_zip(dir.path(), "20260131T235959Z").is_ok());
    let _ = fs::remove_file(outside);
  }

  #[test]
  fn saves_both_files_with_matching_digests() {
    let dir = tempfile::tempdir().unwrap();
    let info = save_snapshot_in(
      dir.path(),
      sample(json!({
        "branches": [{"id": "b1", "name": "الفرع الرئيسي", "tags": ["a", "b"], "extra": {"k": 1}}],
        "categories": []
      })),
      at(1_767_225_600),
    )
    .unwrap();

    assert!(is_valid_backup_id(&info.id));
    assert_eq!(info.total_rows, 1);
    assert_eq!(info.skipped_tables, vec!["payroll_runs"]);
    assert!(Path::new(&info.zip_path).is_file() && Path::new(&info.sqlite_path).is_file());
    assert_eq!(info.zip_sha256, file_sha256(Path::new(&info.zip_path)).unwrap());
    assert!(fs::read_dir(dir.path()).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".part")));

    // read the ZIP back the way the restore tool does and check every hash
    let mut archive = zip::ZipArchive::new(File::open(&info.zip_path).unwrap()).unwrap();
    let mut manifest_raw = String::new();
    archive.by_name("manifest.json").unwrap().read_to_string(&mut manifest_raw).unwrap();
    let manifest: Value = serde_json::from_str(&manifest_raw).unwrap();
    assert_eq!(manifest["format"], ARCHIVE_FORMAT);
    assert_eq!(manifest["checksum"], info.checksum.as_str());
    assert_eq!(manifest["tableCounts"]["branches"], 1);
    for table in ["branches", "categories"] {
      let mut body = String::new();
      archive.by_name(&format!("tables/{table}.json")).unwrap().read_to_string(&mut body).unwrap();
      assert_eq!(manifest["tableSha256"][table], sha256_hex(body.as_bytes()).as_str(), "{table} hash");
    }

    // the SQLite file carries the same data digest and the same rows
    let conn = Connection::open(&info.sqlite_path).unwrap();
    let digest: String = conn.query_row("SELECT checksum FROM backup_meta", [], |r| r.get(0)).unwrap();
    assert_eq!(digest, info.checksum);
    let rows: i64 = conn.query_row("SELECT count(*) FROM table_rows", [], |r| r.get(0)).unwrap();
    assert_eq!(rows, 1);
  }

  #[test]
  fn two_backups_in_one_second_do_not_overwrite_each_other() {
    let dir = tempfile::tempdir().unwrap();
    let a = save_snapshot_in(dir.path(), sample(json!({"branches": [{"id": "1"}]})), at(1_767_225_600)).unwrap();
    let b = save_snapshot_in(dir.path(), sample(json!({"branches": [{"id": "2"}]})), at(1_767_225_600)).unwrap();
    assert_ne!(a.id, b.id);
    assert!(is_valid_backup_id(&b.id));
    assert!(Path::new(&a.zip_path).is_file() && Path::new(&b.zip_path).is_file());
    let index = read_index(dir.path());
    assert_eq!(index.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(), vec![b.id.as_str(), a.id.as_str()]);
  }

  #[test]
  fn rejects_bad_input_without_leaving_files_or_touching_the_index() {
    let dir = tempfile::tempdir().unwrap();
    for tables in [
      json!({"../evil": []}),
      json!({"branches": {"not": "an array"}}),
      json!({"branches": [1, 2]}),
      json!({"Branches": []}),
    ] {
      assert!(save_snapshot_in(dir.path(), sample(tables), at(1_767_225_600)).is_err());
    }
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0, "nothing may be written for rejected input");
  }

  #[test]
  fn index_is_replaced_atomically_and_a_corrupt_one_is_kept_as_evidence() {
    let dir = tempfile::tempdir().unwrap();
    save_snapshot_in(dir.path(), sample(json!({"branches": []})), at(1_767_225_600)).unwrap();
    assert!(!dir.path().join("index.json.tmp").exists());

    fs::write(dir.path().join(INDEX_FILE), b"{ not json").unwrap();
    let after = save_snapshot_in(dir.path(), sample(json!({"branches": []})), at(1_767_225_700)).unwrap();
    assert!(dir.path().join("index.corrupt.json").is_file(), "the damaged index is kept, not overwritten");
    assert_eq!(read_index(dir.path()).len(), 1);
    assert_eq!(read_index(dir.path())[0].id, after.id);
  }

  #[test]
  fn index_lists_only_the_newest_entries() {
    let dir = tempfile::tempdir().unwrap();
    for i in 0..(KEEP_IN_INDEX as i64 + 3) {
      save_snapshot_in(dir.path(), sample(json!({"branches": []})), at(1_767_225_600 + i)).unwrap();
    }
    assert_eq!(read_index(dir.path()).len(), KEEP_IN_INDEX);
  }

  /// `FLUXEN_WRITE_FIXTURE=<path> cargo test write_fixture -- --ignored` regenerates the sample archive the
  /// Node restore tests read, so the two languages are checked against each other.
  #[test]
  #[ignore]
  fn write_fixture() {
    let Ok(target) = std::env::var("FLUXEN_WRITE_FIXTURE") else {
      return;
    };
    let dir = tempfile::tempdir().unwrap();
    let info = save_snapshot_in(
      dir.path(),
      sample(json!({
        "branches": [{"id": "00000000-0000-4000-8000-000000000001", "name": "الفرع الرئيسي", "active": true}],
        "categories": [
          {"id": "00000000-0000-4000-8000-0000000000c1", "code": "REV-RNT", "name": "إيراد إيجار", "meta": {"k": [1, 2, 3]}},
          {"id": "00000000-0000-4000-8000-0000000000c2", "code": "EXP-MNT", "name": "صيانة", "meta": null}
        ],
        "payroll_runs": []
      })),
      at(1_767_225_600),
    )
    .unwrap();
    fs::copy(&info.zip_path, target).unwrap();
  }
}
