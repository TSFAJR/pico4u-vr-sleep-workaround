//! Sleep coordination owns snapshots and ADB writes, never an OpenVR context.
use crate::{
    adb_client::run_adb_device_command,
    config::{SleepConfig, load_config, save_config},
    connection::{self, ConnectionMode},
    runtime::ensure_keep_awake_checked,
    state::AppState,
    steamvr::{
        SteamVr,
        protocol::{DetectionReport, DetectorConfig, Failure},
    },
};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Snapshot {
    device: String,
    transport: String,
    system_brightness: Option<u32>,
    system_mode: Option<u32>,
    restore_physical: f64,
    software_enabled: bool,
    software_percent: u8,
}
impl Snapshot {
    fn restore_commands(&self, device: &str) -> Result<Vec<String>, String> {
        if device != self.device {
            return Err("Connected headset differs from recovery snapshot".into());
        }
        if !self.restore_physical.is_finite()
            || !(0.0..=1.0).contains(&self.restore_physical)
            || self.software_percent > 100
        {
            return Err("Invalid recovery snapshot".into());
        }
        let mut commands = Vec::new();
        if let Some(b) = self.system_brightness {
            commands.push(format!("settings put system screen_brightness {b}"));
        }
        if let Some(m) = self.system_mode.filter(|m| *m <= 1) {
            commands.push(format!("settings put system screen_brightness_mode {m}"));
        }
        commands.push(format!(
            "cmd display set-brightness {}",
            self.restore_physical
        ));
        Ok(commands)
    }
    async fn restore_with<F, Fut>(&self, device: &str, mut write: F) -> Result<(), String>
    where
        F: FnMut(String) -> Fut,
        Fut: std::future::Future<Output = Result<(), String>>,
    {
        let mut errors = Vec::new();
        for command in self.restore_commands(device)? {
            if let Err(e) = write(command).await {
                errors.push(e);
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct SleepStatus {
    pub revision: u64,
    pub phase: String,
    pub monitoring: bool,
    pub sleeping: bool,
    pub busy: bool,
    pub keep_awake: bool,
    pub physical_applied: bool,
    pub software_applied: bool,
    pub recovery_pending: bool,
    pub fallback_restore: bool,
    pub cooldown_secs: u32,
    pub pending_secs: u32,
    pub detection: DetectionReport,
    pub error: Option<Failure>,
    pub changed_at: String,
    pub reason: String,
}
impl Default for SleepStatus {
    fn default() -> Self {
        Self {
            revision: 0,
            phase: "IDLE".into(),
            monitoring: false,
            sleeping: false,
            busy: false,
            keep_awake: false,
            physical_applied: false,
            software_applied: false,
            recovery_pending: false,
            fallback_restore: false,
            cooldown_secs: 0,
            pending_secs: 0,
            detection: Default::default(),
            error: None,
            changed_at: String::new(),
            reason: String::new(),
        }
    }
}
#[derive(Default)]
struct Inner {
    status: SleepStatus,
    snapshot: Option<Snapshot>,
    pending: Option<Instant>,
    cooldown: Option<Instant>,
    calibrating: bool,
    last_config: Option<SleepConfig>,
}
impl Inner {
    fn can_enter(&self, automatic: bool) -> bool {
        !self.status.sleeping
            && !self.status.busy
            && !self.status.recovery_pending
            && (!automatic || (self.status.monitoring && self.pending.is_some()))
    }
    fn observe(&mut self, d: &DetectionReport, c: &SleepConfig, now: Instant) -> bool {
        if !d.valid || self.cooldown.is_some() {
            self.pending = None;
            self.status.pending_secs = 0;
            self.status.phase = "PAUSED".into();
            self.status.error = d.error.clone();
            return false;
        }
        self.status.error = None;
        if !d.candidate || d.activity {
            self.pending = None;
            self.status.pending_secs = 0;
            self.status.phase = "MONITORING".into();
            return false;
        }
        let start = *self.pending.get_or_insert(now);
        let wait: u32 = if c.confirmation { 20 } else { 0 };
        self.status.pending_secs =
            wait.saturating_sub(now.saturating_duration_since(start).as_secs() as u32);
        self.status.phase = "SLEEP_PENDING".into();
        self.status.pending_secs == 0
    }
}
#[derive(Clone, Default)]
pub struct SleepService {
    inner: Arc<Mutex<Inner>>,
    epoch: Arc<AtomicU64>,
    generation: Arc<AtomicU64>,
    physical: Arc<tokio::sync::Mutex<()>>,
    closing: Arc<AtomicBool>,
}
fn failure(code: &str, e: impl ToString) -> Failure {
    Failure::new(code, e)
}
fn journal_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("sleep-recovery.json"))
}
fn journal(app: &AppHandle, snapshot: &Snapshot) -> Result<(), String> {
    let path = journal_path(app)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    std::fs::write(
        &tmp,
        serde_json::to_vec_pretty(snapshot).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}
async fn shell(app: &AppHandle, serial: &str, command: &str) -> Result<String, String> {
    let result =
        run_adb_device_command(Some(app), Some(serial), &format!("shell:{command}")).await?;
    // shell v1 lacks an exit code; append a sentinel for writes separately.
    Ok(result.trim().to_string())
}
async fn write_shell(app: &AppHandle, serial: &str, command: &str) -> Result<(), String> {
    let output = shell(app, serial, &format!("{command}; echo __PICO_STATUS_$?")).await?;
    if output.ends_with("__PICO_STATUS_0")
        && !output.to_lowercase().contains("error")
        && !output.contains("Exception")
        && !["unknown", "failed", "invalid"]
            .iter()
            .any(|word| output.to_lowercase().contains(word))
    {
        Ok(())
    } else {
        Err(output)
    }
}
async fn target(app: &AppHandle) -> Result<String, String> {
    let c = load_config(app);
    connection::require_target(
        app,
        c.last_connection_mode.unwrap_or(ConnectionMode::Wired),
        &c.ip_address,
    )
    .await
    .map_err(|e| e.to_string())
}
async fn device_id(app: &AppHandle, serial: &str) -> Result<String, String> {
    let id = shell(app, serial, "getprop ro.serialno").await?;
    if id.is_empty()
        || id == "unknown"
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Err("Reliable device serial unavailable".into())
    } else {
        Ok(id)
    }
}
impl SleepService {
    pub fn status(&self) -> SleepStatus {
        self.inner.lock().unwrap().status.clone()
    }
    fn update(&self, app: &AppHandle, f: impl FnOnce(&mut Inner)) {
        let status = {
            let mut i = self.inner.lock().unwrap();
            let old = i.status.phase.clone();
            f(&mut i);
            i.status.revision += 1;
            i.status.keep_awake = app.state::<AppState>().is_running.load(Ordering::SeqCst);
            if old != i.status.phase {
                i.status.changed_at = chrono::Utc::now().to_rfc3339();
            }
            i.status.clone()
        };
        let _ = app.emit("sleep-status", status);
    }
    fn error(&self, app: &AppHandle, code: &str, e: impl ToString) {
        self.update(app, |i| {
            i.status.error = Some(failure(code, e));
            i.status.busy = false;
            if !i.status.sleeping {
                i.status.phase = "ERROR".into();
            }
        });
    }
    fn detector_config(&self, c: &SleepConfig) -> DetectorConfig {
        let i = self.inner.lock().unwrap();
        DetectorConfig {
            enabled: i.status.monitoring
                && !i.status.sleeping
                && !i.status.busy
                && !i.status.recovery_pending
                && i.cooldown.is_none(),
            generation: self.generation.load(Ordering::SeqCst),
            minutes: c.minutes,
            sensitivity: c.sensitivity,
            rotation: c.rotation,
            controllers: c.controllers,
            calibrating: i.calibrating,
            noise_position: c.noise_position,
            noise_rotation: c.noise_rotation,
        }
    }
    pub fn start(&self, app: AppHandle) {
        let recovery = journal_path(&app).ok().filter(|p| p.exists()).map(|p| {
            std::fs::read(p)
                .ok()
                .and_then(|s| serde_json::from_slice::<Snapshot>(&s).ok())
        });
        self.update(&app, |i| {
            i.status.monitoring = load_config(&app).sleep.enabled;
            if let Some(s) = recovery {
                i.snapshot = s;
                i.status.recovery_pending = true;
                i.status.fallback_restore = true;
                i.status.phase = "ERROR".into();
                i.status.error = Some(failure(
                    "recovery_pending",
                    "Previous physical brightness restoration is pending",
                ));
            }
        });
        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            while !service.closing.load(Ordering::SeqCst) {
                service.tick(&app).await;
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
    }
    pub async fn stop_monitoring(&self, app: &AppHandle) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.epoch.fetch_add(1, Ordering::SeqCst);
        self.update(app, |i| {
            i.status.busy = false;
            i.status.monitoring = false;
            i.pending = None;
            i.calibrating = false;
            if !i.status.sleeping && !i.status.busy {
                i.status.phase = "IDLE".into();
            }
        });
        app.state::<SteamVr>()
            .set_detection(self.detector_config(&load_config(app).sleep));
        let state = app.state::<AppState>();
        let _guard = state.config_write.lock().await;
        let mut c = load_config(app);
        c.sleep.enabled = false;
        if let Err(e) = save_config(app, &c) {
            self.error(app, "save_failed", e);
        }
    }
    pub async fn monitor(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        if !enabled {
            self.stop_monitoring(app).await;
            return Ok(());
        }
        let c = load_config(app);
        c.validate()?;
        // Enabling intent is remembered even if the runtime is temporarily absent.
        {
            let state = app.state::<AppState>();
            let _guard = state.config_write.lock().await;
            let mut c = load_config(app);
            c.sleep.enabled = true;
            save_config(app, &c)?;
        }
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.update(app, |i| {
            i.status.monitoring = true;
            i.status.error = None;
            if !i.status.sleeping {
                i.status.phase = "PAUSED".into();
            }
            i.pending = None;
        });
        Ok(())
    }
    async fn protect(&self, app: &AppHandle, token: u64) -> Result<String, String> {
        let c = load_config(app);
        let serial = app
            .state::<crate::connection_manager::ConnectionManager>()
            .ensure(
                app,
                c.last_connection_mode.unwrap_or(ConnectionMode::Wired),
                &c.ip_address,
                true,
                false,
            )
            .await
            .map_err(|e| e.to_string())?;
        if self.epoch.load(Ordering::SeqCst) != token {
            return Err("cancelled".into());
        }
        let c = load_config(app);
        ensure_keep_awake_checked(
            app,
            &app.state::<AppState>(),
            c.last_connection_mode.unwrap_or(ConnectionMode::Wired),
            || self.epoch.load(Ordering::SeqCst) == token && !self.closing.load(Ordering::SeqCst),
        )
        .await
        .map_err(|e| e.to_string())?;
        Ok(serial)
    }
    pub async fn enter(&self, app: &AppHandle, automatic: bool) -> Result<(), String> {
        let token = {
            let mut i = self.inner.lock().unwrap();
            if !i.can_enter(automatic) {
                return if i.status.recovery_pending && !i.status.sleeping {
                    Err("recovery_pending".into())
                } else {
                    Ok(())
                };
            }
            i.status.busy = true;
            self.epoch.fetch_add(1, Ordering::SeqCst) + 1
        };
        let vr = app.state::<SteamVr>();
        let software = vr.snapshot();
        let manual = vr.manual_generation();
        let result = self
            .enter_inner(app, automatic, token, software, manual)
            .await;
        if self.epoch.load(Ordering::SeqCst) == token {
            if let Err(e) = &result {
                self.error(app, "enter_failed", e);
            } else {
                self.update(app, |i| i.status.busy = false);
            }
        }
        result
    }
    async fn enter_inner(
        &self,
        app: &AppHandle,
        automatic: bool,
        token: u64,
        software: (bool, u8),
        manual: u64,
    ) -> Result<(), String> {
        let serial = self.protect(app, token).await?;
        let _guard = self.physical.lock().await;
        if self.epoch.load(Ordering::SeqCst) != token || self.closing.load(Ordering::SeqCst) {
            return Ok(());
        }
        let c = load_config(app).sleep;
        c.validate()?;
        let id = device_id(app, &serial).await?;
        let brightness = shell(app, &serial, "settings get system screen_brightness")
            .await
            .ok()
            .and_then(|s| s.parse().ok());
        let mode = shell(app, &serial, "settings get system screen_brightness_mode")
            .await
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
            .filter(|m| *m <= 1);
        let vr = app.state::<SteamVr>();
        let (enabled, percent) = software;
        let snapshot = Snapshot {
            device: id,
            transport: serial.clone(),
            system_brightness: brightness,
            system_mode: mode,
            restore_physical: c.restore_physical,
            software_enabled: enabled,
            software_percent: percent,
        };
        if self.epoch.load(Ordering::SeqCst) != token {
            return Ok(());
        }
        let mut committed = false;
        let mut saved = Ok(());
        self.update(app, |i| {
            if self.epoch.load(Ordering::SeqCst) != token {
                return;
            }
            saved = journal(app, &snapshot);
            if saved.is_err() {
                return;
            }
            committed = true;
            i.snapshot = Some(snapshot);
            i.status.recovery_pending = true;
            i.status.sleeping = true;
            i.status.fallback_restore = true;
            i.status.phase = if automatic {
                "SLEEPING_AUTO"
            } else {
                "SLEEPING_MANUAL"
            }
            .into();
            i.status.reason = if automatic { "low_motion" } else { "manual" }.into();
            i.pending = None;
            i.status.error = None;
        });
        saved?;
        if !committed {
            return Ok(());
        }
        // Commit brightness under the same lock used by exit's epoch change.
        {
            let _i = self.inner.lock().unwrap();
            if self.epoch.load(Ordering::SeqCst) != token {
                return Ok(());
            }
            vr.temporary_if_manual(manual, true, c.software_percent, c.enter_seconds);
        }
        let result = write_shell(
            app,
            &serial,
            &format!("cmd display set-brightness {}", c.physical),
        )
        .await;
        if self.epoch.load(Ordering::SeqCst) == token {
            self.update(app, |i| {
                i.status.physical_applied = result.is_ok();
                if let Err(e) = &result {
                    i.status.error = Some(failure("physical_failed", e));
                }
            });
        }
        result
    }
    pub async fn exit(&self, app: &AppHandle) -> Result<(), String> {
        let (token, snapshot) = {
            let mut i = self.inner.lock().unwrap();
            let token = self.epoch.fetch_add(1, Ordering::SeqCst) + 1;
            i.pending = None;
            i.calibrating = false;
            i.status.busy = true;
            let s = i.snapshot.clone();
            if let Some(s) = &s {
                app.state::<SteamVr>().temporary(
                    s.software_enabled,
                    s.software_percent,
                    load_config(app).sleep.exit_seconds,
                );
            }
            (token, s)
        };
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.update(app, |i| {
            i.status.sleeping = false;
            i.cooldown = Some(
                Instant::now()
                    + Duration::from_secs(u64::from(load_config(app).sleep.cooldown_minutes) * 60),
            );
            i.status.reason = "manual_exit".into();
        });
        let _guard = self.physical.lock().await;
        let result = if let Some(s) = snapshot {
            async {
                let serial = target(app).await?;
                let device = device_id(app, &serial).await?;
                s.restore_with(&device, |command| {
                    let serial = serial.clone();
                    async move { write_shell(app, &serial, &command).await }
                })
                .await?;
                if let Ok(path) = journal_path(app) {
                    match std::fs::remove_file(path) {
                        Ok(()) => {}
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                        Err(e) => return Err(e.to_string()),
                    };
                }
                Ok::<(), String>(())
            }
            .await
        } else if self.status().recovery_pending {
            Err("Recovery file is unreadable; original snapshot cannot be recovered".into())
        } else {
            Ok(())
        };
        if self.epoch.load(Ordering::SeqCst) == token {
            self.update(app, |i| {
                i.status.busy = false;
                i.status.physical_applied = false;
                i.status.software_applied = false;
                match &result {
                    Ok(()) => {
                        i.snapshot = None;
                        i.status.recovery_pending = false;
                        i.status.error = None;
                        i.status.phase = if i.status.monitoring {
                            "PAUSED"
                        } else {
                            "IDLE"
                        }
                        .into();
                    }
                    Err(e) => {
                        i.status.phase = "ERROR".into();
                        i.status.error = Some(failure("restore_failed", e));
                    }
                }
            });
        }
        result
    }
    pub fn calibrate(&self, app: &AppHandle, enabled: bool) -> Result<(), String> {
        let mut i = self.inner.lock().unwrap();
        if i.status.sleeping || i.status.busy {
            return Err("sleep_busy".into());
        }
        i.calibrating = enabled;
        i.status.reason = if enabled {
            "calibrating"
        } else {
            "calibration_cancelled"
        }
        .into();
        i.pending = None;
        drop(i);
        self.generation.fetch_add(1, Ordering::SeqCst);
        app.state::<SteamVr>()
            .set_detection(self.detector_config(&load_config(app).sleep));
        Ok(())
    }
    async fn tick(&self, app: &AppHandle) {
        let c = load_config(app).sleep;
        if let Err(e) = c.validate() {
            self.error(app, "invalid_settings", e);
            return;
        }
        let vr = app.state::<SteamVr>();
        {
            let mut i = self.inner.lock().unwrap();
            if i.last_config.as_ref() != Some(&c) {
                i.last_config = Some(c.clone());
                i.pending = None;
                self.generation.fetch_add(1, Ordering::SeqCst);
            }
        }
        let s = self.status();
        if s.monitoring && !s.sleeping && !s.busy && !s.recovery_pending {
            let token = self.epoch.load(Ordering::SeqCst);
            if let Err(e) = self.protect(app, token).await {
                if self.epoch.load(Ordering::SeqCst) != token {
                    return;
                }
                self.generation.fetch_add(1, Ordering::SeqCst);
                let mut config = self.detector_config(&c);
                config.enabled = false;
                vr.set_detection(config);
                self.update(app, |i| {
                    i.status.phase = "PAUSED".into();
                    i.status.error = Some(failure("adb_unavailable", e));
                    i.pending = None;
                });
                return;
            }
        }
        if self.closing.load(Ordering::SeqCst) {
            return;
        }
        self.update(app, |i| {
            if let Some(until) = i.cooldown {
                let left = until.saturating_duration_since(Instant::now());
                i.status.cooldown_secs = left.as_secs() as u32;
                if left.is_zero() {
                    i.cooldown = None;
                    self.generation.fetch_add(1, Ordering::SeqCst);
                }
            }
        });
        vr.set_detection(self.detector_config(&c));
        let d = vr.detection();
        let mut trigger = false;
        let mut calibration = None;
        self.update(app, |i| {
            i.status.detection = d.clone();
            if i.status.sleeping {
                let status = vr.status();
                let (enabled, percent) = vr.snapshot();
                i.status.software_applied =
                    (!enabled || status.applied_percent == Some(percent)) && status.error.is_none();
                if let Some(e) = status.error {
                    i.status.error = Some(e);
                }
                return;
            }
            if d.generation != self.generation.load(Ordering::SeqCst) {
                if i.status.monitoring && !i.status.busy && !i.status.recovery_pending {
                    i.status.phase = "PAUSED".into();
                    i.pending = None;
                    i.status.error = vr.status().error;
                }
                return;
            }
            if i.calibrating {
                calibration = d.calibration;
                return;
            }
            if !i.status.monitoring || i.status.busy || i.status.recovery_pending {
                return;
            }
            trigger = i.observe(&d, &c, Instant::now());
        });
        if let Some(noise) = calibration {
            let state = app.state::<AppState>();
            let _guard = state.config_write.lock().await;
            let mut config = load_config(app);
            config.sleep.noise_position = noise[0];
            config.sleep.noise_rotation = noise[1];
            match save_config(app, &config) {
                Ok(()) => {
                    let mut i = self.inner.lock().unwrap();
                    i.calibrating = false;
                    i.status.reason = "calibrated".into();
                }
                Err(e) => {
                    self.error(app, "save_failed", e);
                    self.inner.lock().unwrap().calibrating = false;
                }
            }
        }
        if trigger && !self.closing.load(Ordering::SeqCst) {
            let _ = self.enter(app, true).await;
        }
    }
    pub async fn shutdown(&self, app: &AppHandle) {
        self.closing.store(true, Ordering::SeqCst);
        // Hide immediately; no restoration task may subsequently re-create an overlay.
        app.state::<SteamVr>().shutdown().await;
        let _ = tokio::time::timeout(Duration::from_secs(4), self.exit(app)).await;
    }
}
#[tauri::command]
pub fn get_sleep_status(state: State<'_, SleepService>) -> SleepStatus {
    state.status()
}
#[tauri::command]
pub async fn enter_sleep(app: AppHandle, state: State<'_, SleepService>) -> Result<(), String> {
    state.enter(&app, false).await
}
#[tauri::command]
pub async fn exit_sleep(app: AppHandle, state: State<'_, SleepService>) -> Result<(), String> {
    state.exit(&app).await
}
#[tauri::command]
pub async fn set_sleep_monitoring(
    app: AppHandle,
    state: State<'_, SleepService>,
    enabled: bool,
) -> Result<(), String> {
    state.monitor(&app, enabled).await
}
#[tauri::command]
pub fn calibrate_sleep(
    app: AppHandle,
    state: State<'_, SleepService>,
    enabled: bool,
) -> Result<(), String> {
    state.calibrate(&app, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot() -> Snapshot {
        Snapshot {
            device: "test-headset".into(),
            transport: "192.168.1.1:5555".into(),
            system_brightness: Some(128),
            system_mode: Some(1),
            restore_physical: 0.5,
            software_enabled: true,
            software_percent: 32,
        }
    }
    #[test]
    fn recovery_preserves_units_identity_and_software_snapshot() {
        let s = snapshot();
        let bytes = serde_json::to_vec(&s).unwrap();
        let restored: Snapshot = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(restored.software_percent, 32);
        assert!(restored.restore_commands("other-headset").is_err());
        assert_eq!(
            restored.restore_commands("test-headset").unwrap(),
            vec![
                "settings put system screen_brightness 128",
                "settings put system screen_brightness_mode 1",
                "cmd display set-brightness 0.5"
            ]
        );
    }
    #[tokio::test]
    async fn restore_attempts_fallback_even_if_settings_write_fails_and_can_retry() {
        let s = snapshot();
        let mut calls = Vec::new();
        let result = s
            .restore_with("test-headset", |cmd| {
                calls.push(cmd);
                let first = calls.len() == 1;
                async move {
                    if first {
                        Err("settings failed".into())
                    } else {
                        Ok(())
                    }
                }
            })
            .await;
        assert!(result.is_err());
        assert_eq!(calls.len(), 3);
        assert!(
            s.restore_with("test-headset", |_| async { Ok(()) })
                .await
                .is_ok()
        );
        let mut calls = 0;
        assert!(
            s.restore_with("wrong", |_| {
                calls += 1;
                async { Ok(()) }
            })
            .await
            .is_err()
        );
        assert_eq!(calls, 0);
    }
    #[test]
    fn confirmation_activity_cooldown_and_duplicate_enter() {
        let mut i = Inner::default();
        let c = SleepConfig::default();
        let now = Instant::now();
        assert!(i.can_enter(false));
        assert!(!i.can_enter(true));
        i.status.monitoring = true;
        let d = DetectionReport {
            valid: true,
            candidate: true,
            ..Default::default()
        };
        assert!(!i.observe(&d, &c, now));
        assert_eq!(i.status.pending_secs, 20);
        assert!(!i.observe(&d, &c, now + Duration::from_secs(19)));
        assert!(i.observe(&d, &c, now + Duration::from_secs(20)));
        i.status.busy = true;
        assert!(!i.can_enter(true));
        assert!(!i.can_enter(false));
        i.status.busy = false;
        i.status.sleeping = true;
        assert!(!i.can_enter(false));
        i.status.sleeping = false;
        assert!(!i.observe(
            &DetectionReport {
                activity: true,
                ..d.clone()
            },
            &c,
            now + Duration::from_secs(21)
        ));
        assert!(i.pending.is_none());
        i.cooldown = Some(now + Duration::from_secs(900));
        assert!(!i.observe(&d, &c, now + Duration::from_secs(30)));
        assert_eq!(i.status.phase, "PAUSED");
        i.status.recovery_pending = true;
        assert!(!i.can_enter(false));
    }
    #[test]
    fn saved_preferences_do_not_carry_running_progress_or_sleep_state() {
        let service = SleepService::default();
        let s = service.status();
        assert!(!s.sleeping);
        assert!(!s.busy);
        assert!(!s.monitoring);
        assert_eq!(s.detection.elapsed_secs, 0);
        service.generation.store(5, Ordering::SeqCst);
        assert_eq!(
            service.detector_config(&SleepConfig::default()).generation,
            5
        );
        assert!(!service.detector_config(&SleepConfig::default()).enabled);
    }
}
