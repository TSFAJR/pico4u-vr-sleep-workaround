#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod adb_client;
mod commands;
mod config;
mod connection;
mod error;
mod runtime;
mod state;
mod steamvr;

use crate::commands::*;
use crate::runtime::*;
use crate::state::AppState;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .manage(steamvr::SteamVr::default())
        .setup(|app| {
            app.state::<steamvr::SteamVr>().start(
                app.handle().clone(),
                config::load_config(app.handle()).steamvr_brightness_percent,
            );
            if let Some(window) = app.get_webview_window("main") {
                let suffix = if cfg!(debug_assertions) { "-dev" } else { "" };
                let title = format!("pico4u V睡ツール v{}{}", env!("CARGO_PKG_VERSION"), suffix);
                let _ = window.set_title(&title);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_connection_status,
            try_auto_connect,
            setup_wireless,
            start_keep_awake,
            stop_keep_awake,
            get_running,
            set_debug_mode,
            get_config,
            save_config_cmd,
            steamvr::get_steamvr_status,
            steamvr::set_steamvr_enabled,
            steamvr::set_steamvr_percent,
            steamvr::restore_steamvr,
            steamvr::retry_steamvr
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = &event
            {
                let service = app.state::<steamvr::SteamVr>().inner().clone();
                if service.begin_shutdown() {
                    api.prevent_exit();
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        service.shutdown().await;
                        handle.exit(0);
                    });
                }
            }
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                for slot in [&state.keep_awake_task, &state.dim_task] {
                    if let Some(task) = slot.lock().unwrap().take() {
                        task.abort();
                    }
                }
                // Kill only the foreground server child created by this app.
                // Never kill a shared server, or all processes named adb.exe.
                if let Some(child) = state.adb_child.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
