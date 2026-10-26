use crate::adb_client::run_adb_device_command;
use crate::config::load_config;
use crate::connection::ConnectionMode;
use crate::error::{AppError, ErrorCode};
use crate::state::AppState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::time::{Duration, MissedTickBehavior, interval, timeout};

#[tauri::command]
pub fn get_running(state: State<'_, AppState>) -> bool {
    state.is_running.load(Ordering::SeqCst)
}

#[tauri::command]
pub async fn start_keep_awake(
    app: AppHandle,
    state: State<'_, AppState>,
    mode: ConnectionMode,
) -> Result<(), AppError> {
    ensure_keep_awake(&app, &state, mode).await
}

pub async fn ensure_keep_awake(
    app: &AppHandle,
    state: &AppState,
    mode: ConnectionMode,
) -> Result<(), AppError> {
    ensure_keep_awake_checked(app, state, mode, || true).await
}

pub async fn ensure_keep_awake_checked(
    app: &AppHandle,
    state: &AppState,
    mode: ConnectionMode,
    valid: impl Fn() -> bool,
) -> Result<(), AppError> {
    let epoch = state.runtime_epoch.load(Ordering::SeqCst);
    let _guard = state.operation.lock().await;
    if epoch != state.runtime_epoch.load(Ordering::SeqCst) || !valid() {
        return Err(AppError::new(ErrorCode::Unknown));
    }
    if state.is_running.load(Ordering::SeqCst) {
        return Ok(());
    }
    let config = load_config(app);
    config
        .validate()
        .map_err(|e| AppError::with(ErrorCode::Unknown, e))?;
    let serial = timeout(
        Duration::from_secs(25),
        app.state::<crate::connection_manager::ConnectionManager>()
            .ensure(app, mode, &config.ip_address, true, true),
    )
    .await
    .map_err(|_| AppError::new(ErrorCode::Timeout))??;
    let _commit = state.runtime_commit.lock().unwrap();
    if epoch != state.runtime_epoch.load(Ordering::SeqCst) || !valid() {
        return Err(AppError::new(ErrorCode::Unknown));
    }
    state.is_running.store(true, Ordering::SeqCst);
    let debug = state.debug_mode.clone();
    let wake_app = app.clone();
    let wake_serial = serial.clone();
    let task = tokio::spawn(async move {
        let mut timer = interval(Duration::from_secs(config.keep_awake_interval_secs));
        timer.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            timer.tick().await;
            let result = async {
                wake_app
                    .state::<crate::connection_manager::ConnectionManager>()
                    .ensure(&wake_app, mode, &config.ip_address, true, false)
                    .await?;
                let power = run_adb_device_command(
                    Some(&wake_app),
                    Some(&wake_serial),
                    "shell:dumpsys power",
                )
                .await;
                if !power.is_ok_and(|output| output.contains("mWakefulness=Awake")) {
                    run_adb_device_command(
                        Some(&wake_app),
                        Some(&wake_serial),
                        "shell:input keyevent 224",
                    )
                    .await?;
                }
                Ok::<_, AppError>(())
            }
            .await;
            if let Err(ref error) = result {
                wake_app
                    .state::<crate::connection_manager::ConnectionManager>()
                    .invalidate(&wake_serial, error.clone());
            }
            if debug.load(Ordering::Relaxed) {
                let message = match result {
                    Ok(()) => "Keep Alive checked".to_string(),
                    Err(e) => format!("Keep Alive: {e}"),
                };
                let _ = wake_app.emit("debug-log", message);
            }
        }
    });
    *state.keep_awake_task.lock().unwrap() = Some(task);
    Ok(())
}

#[tauri::command]
pub async fn stop_keep_awake(app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError> {
    let wake = {
        let _commit = state.runtime_commit.lock().unwrap();
        state.runtime_epoch.fetch_add(1, Ordering::SeqCst);
        state.is_running.store(false, Ordering::SeqCst);
        state.keep_awake_task.lock().unwrap().take()
    };
    app.state::<crate::connection_manager::ConnectionManager>()
        .cancel();
    // No network/connection lock on the stop path.
    if let Some(task) = wake {
        task.abort();
        let _ = task.await;
    }
    app.state::<crate::sleep::SleepService>()
        .stop_monitoring(&app)
        .await;
    Ok(())
}
