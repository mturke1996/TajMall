mod backup;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      backup::save_cold_backup,
      backup::list_cold_backups,
      backup::reveal_backups_folder,
      backup::export_backup_copy,
      backup::get_backups_dir,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
