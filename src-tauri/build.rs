// Declaring the commands here turns every one of them into a permission (`allow-<command>`) that a
// capability must grant explicitly. Without this, any page the shell is allowed to show could call any
// command. Keep this list identical to COMMANDS in src/lib.rs (a test checks it).
fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
      "save_cold_backup",
      "list_cold_backups",
      "reveal_backups_folder",
      "export_backup_copy",
      "get_backups_dir",
      "get_shell_info",
    ])),
  )
  .expect("failed to run tauri-build");
}
