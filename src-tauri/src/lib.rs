pub mod commands;
pub mod db;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let db_path = app_data_dir.join("estudio.sqlite");
            let conn = db::init_db(&db_path)
                .expect("Failed to initialize SQLite database for E-Studio");
            app.manage(commands::DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::template_list,
            commands::template_get,
            commands::template_get_revision,
            commands::template_save,
            commands::template_delete,
            commands::catalog_search,
            commands::catalog_upsert,
            commands::catalog_replace_all,
            commands::job_insert,
            commands::job_list,
            commands::job_set_status,
            commands::audit_append,
            commands::audit_list,
            commands::prefs_get,
            commands::prefs_set,
            commands::batch_import_record,
            commands::batch_import_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
