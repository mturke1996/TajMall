mod backup;

use serde::Serialize;
#[cfg(desktop)]
use tauri::Manager;

/// Version of the IPC contract between this shell and the hosted web app. Raise it when a command changes
/// in a way an older web app (or an older shell) cannot cope with; the web app reads it with `get_shell_info`.
pub const IPC_PROTOCOL: u32 = 1;

/// Every command the web page may call. Each one needs its own permission in `capabilities/` and an entry in
/// `build.rs`; the tests below fail if the three lists drift apart.
pub const COMMANDS: &[&str] = &[
  "save_cold_backup",
  "list_cold_backups",
  "reveal_backups_folder",
  "export_backup_copy",
  "get_backups_dir",
  "get_shell_info",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShellInfo {
  shell_version: &'static str,
  ipc_protocol: u32,
  commands: &'static [&'static str],
}

#[tauri::command]
fn get_shell_info() -> ShellInfo {
  ShellInfo {
    shell_version: env!("CARGO_PKG_VERSION"),
    ipc_protocol: IPC_PROTOCOL,
    commands: COMMANDS,
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  // A second copy of the app would open the same local data and race the first one: focus the running
  // window instead. Must be the first plugin registered.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
    }
  }));

  builder
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
      get_shell_info,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  fn kebab(command: &str) -> String {
    command.replace('_', "-")
  }

  #[test]
  fn build_script_declares_every_command() {
    let build = include_str!("../build.rs");
    for command in COMMANDS {
      assert!(build.contains(&format!("\"{command}\"")), "build.rs does not declare {command}");
    }
  }

  #[test]
  fn production_capability_grants_each_command_and_only_the_production_origin() {
    let raw = include_str!("../capabilities/default.json");
    let json: serde_json::Value = serde_json::from_str(raw).unwrap();
    let permissions: Vec<&str> = json["permissions"].as_array().unwrap().iter().filter_map(|p| p.as_str()).collect();
    for command in COMMANDS {
      assert!(permissions.contains(&format!("allow-{}", kebab(command)).as_str()), "default.json lacks allow-{}", kebab(command));
    }
    let urls: Vec<&str> = json["remote"]["urls"].as_array().unwrap().iter().filter_map(|u| u.as_str()).collect();
    assert!(!urls.is_empty());
    for url in urls {
      assert!(url.starts_with("https://"), "production capability must be https only: {url}");
      assert!(!url.contains("localhost") && !url.contains("127.0.0.1"), "no local origin in production: {url}");
    }
  }

  #[test]
  fn development_capability_is_not_enabled_in_the_production_config() {
    let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let enabled: Vec<&str> = conf["app"]["security"]["capabilities"].as_array().unwrap().iter().filter_map(|c| c.as_str()).collect();
    assert_eq!(enabled, vec!["default"], "only the production capability may ship");
    let dev: serde_json::Value = serde_json::from_str(include_str!("../capabilities/dev.json")).unwrap();
    assert_eq!(dev["identifier"], "dev");
  }

  #[test]
  fn shell_info_reports_the_contract() {
    let info = get_shell_info();
    assert_eq!(info.ipc_protocol, IPC_PROTOCOL);
    assert!(info.commands.contains(&"save_cold_backup"));
  }
}
