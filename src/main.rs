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
mod sleep;
mod state;
mod steamvr;

use crate::commands::*;
use crate::runtime::*;
use crate::state::AppState;
use tauri::Manager;

fn shutdown_application(app: tauri::AppHandle) {
    let service = app.state::<steamvr::SteamVr>().inner().clone();
    if !service.begin_shutdown() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        {
            let state = app.state::<AppState>();
            state
                .is_running
                .store(false, std::sync::atomic::Ordering::SeqCst);
            if let Some(task) = state.keep_awake_task.lock().unwrap().take() {
                task.abort();
            }
        }
        app.state::<sleep::SleepService>().shutdown(&app).await;
        service.shutdown().await;
        if let Some(child) = app.state::<AppState>().adb_child.lock().unwrap().take() {
            let _ = child.kill();
        }
        app.exit(0);
    });
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    shutdown_application(app);
}

fn main() {
    tauri::Builder::default()
        // Register first, before setup can start ADB, monitoring or the helper.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .manage(steamvr::SteamVr::default())
        .manage(sleep::SleepService::default())
        .setup(|app| {
            app.state::<steamvr::SteamVr>().start(
                app.handle().clone(),
                config::load_config(app.handle()).steamvr_brightness_percent,
            );
            app.state::<sleep::SleepService>()
                .start(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                let suffix = if cfg!(debug_assertions) { "-dev" } else { "" };
                let title = format!("pico4u V睡ツール v{}{}", env!("CARGO_PKG_VERSION"), suffix);
                let _ = window.set_title(&title);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            exit_app,
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
            sleep::get_sleep_status,
            sleep::enter_sleep,
            sleep::exit_sleep,
            sleep::set_sleep_monitoring,
            sleep::calibrate_sleep,
            steamvr::retry_steamvr
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = &event
            {
                api.prevent_exit();
                shutdown_application(app.clone());
            }
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<AppState>();
                if let Some(task) = state.keep_awake_task.lock().unwrap().take() {
                    task.abort();
                }
                // Kill only the foreground server child created by this app.
                // Never kill a shared server, or all processes named adb.exe.
                if let Some(child) = state.adb_child.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
