//! Isolated OpenVR supervisor. No OpenVR library or ADB operation runs here.
#[path = "../steamvr-helper/src/protocol.rs"]
#[allow(dead_code)]
mod protocol;
use protocol::{Desired, Failure, Report};
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::watch,
};

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Status {
    revision: u64,
    enabled: bool,
    percent: u8,
    phase: String,
    applied_percent: Option<u8>,
    error: Option<Failure>,
}

#[derive(Clone)]
pub struct SteamVr {
    desired: watch::Sender<Desired>,
    report: Arc<Mutex<Report>>,
    closed: Arc<AtomicBool>,
    closing: Arc<AtomicBool>,
}

impl Default for SteamVr {
    fn default() -> Self {
        Self {
            desired: watch::channel(Desired::default()).0,
            report: Arc::new(Mutex::new(Report::default())),
            closed: Arc::new(AtomicBool::new(false)),
            closing: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl SteamVr {
    pub fn auto_dim(&self, config: &crate::config::AppConfig) {
        if !config.auto_dim_steamvr
            || config.auto_dim_steamvr_percent > 100
            || self.closing.load(Ordering::SeqCst)
        {
            return;
        }
        self.desired.send_modify(|d| {
            d.revision += 1;
            d.enabled = true;
            d.percent = config.auto_dim_steamvr_percent;
        });
    }
    pub fn start(&self, app: AppHandle, percent: u8) {
        self.desired.send_modify(|d| d.percent = percent);
        let service = self.clone();
        tauri::async_runtime::spawn(async move {
            service.supervise(app).await;
        });
    }
    pub fn status(&self) -> Status {
        let d = self.desired.borrow().clone();
        let report = self
            .report
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        let phase = if d.revision > report.revision {
            "updating".into()
        } else {
            report.phase
        };
        Status {
            revision: d.revision,
            enabled: d.enabled,
            percent: d.percent,
            phase,
            applied_percent: report.applied_percent,
            error: report.error,
        }
    }
    fn change(&self, request: u64, change: impl FnOnce(&mut Desired)) -> Result<Status, String> {
        if self.closing.load(Ordering::SeqCst) {
            return Err("SteamVR supervisor is closing".into());
        }
        self.desired.send_if_modified(|d| {
            if request <= d.revision {
                return false;
            }
            change(d);
            d.revision = request;
            true
        });
        Ok(self.status())
    }
    fn publish(&self, app: &AppHandle, report: Report) {
        let mut previous = self.report.lock().unwrap_or_else(|e| e.into_inner());
        if *previous != report {
            *previous = report;
            drop(previous);
            let _ = app.emit("steamvr-brightness-status", self.status());
        }
    }
    pub fn begin_shutdown(&self) -> bool {
        !self.closing.swap(true, Ordering::SeqCst)
    }
    pub async fn shutdown(&self) {
        self.desired.send_modify(|d| {
            d.revision += 1;
            d.enabled = false;
            d.quit = true;
        });
        for _ in 0..25 {
            if self.closed.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    async fn supervise(&self, app: AppHandle) {
        let mut receiver = self.desired.subscribe();
        let mut crashes = RestartBudget::default();
        let mut retry_seen = 0;
        let mut paused = false;
        loop {
            let target = receiver.borrow().clone();
            if target.quit {
                break;
            }
            if target.retry != retry_seen {
                crashes = RestartBudget::default();
                retry_seen = target.retry;
                paused = false;
            }
            if paused {
                self.publish(
                    &app,
                    Report {
                        revision: target.revision,
                        phase: "error".into(),
                        applied_percent: if !target.enabled || target.percent == 100 {
                            Some(100)
                        } else {
                            None
                        },
                        error: Some(Failure::new(
                            "restart_limit",
                            "Helper failed repeatedly; press Retry",
                        )),
                    },
                );
                if receiver.changed().await.is_err() {
                    break;
                }
                continue;
            }
            let result = self.run_child(&app, &mut receiver).await;
            if receiver.borrow().quit {
                break;
            }
            if let Err(error) = result {
                let d = receiver.borrow().clone();
                crashes.record(Instant::now());
                paused = crashes.exhausted(Instant::now());
                self.publish(
                    &app,
                    Report {
                        revision: d.revision,
                        phase: "error".into(),
                        applied_percent: if !d.enabled || d.percent == 100 {
                            Some(100)
                        } else {
                            None
                        },
                        error: Some(error),
                    },
                );
                tokio::select! {
                    _=tokio::time::sleep(Duration::from_secs(2))=>{},
                    _=receiver.changed()=>{},
                }
            }
        }
        self.closed.store(true, Ordering::SeqCst);
    }

    async fn run_child(
        &self,
        app: &AppHandle,
        receiver: &mut watch::Receiver<Desired>,
    ) -> Result<(), Failure> {
        let path = helper_path()?;
        let mut command = Command::new(path);
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let mut child = command
            .spawn()
            .map_err(|e| Failure::new("helper_missing", e))?;
        // Closing the parent's job handle kills this owned helper even after a
        // parent crash. The job never contains SteamVR, VD, VRChat or ADB.
        #[cfg(windows)]
        let _job = match own_job(&child) {
            Ok(job) => job,
            Err(e) => {
                kill(&mut child).await;
                return Err(e);
            }
        };
        let mut input = child
            .stdin
            .take()
            .ok_or_else(|| Failure::new("helper_protocol", "stdin missing"))?;
        let mut output = BufReader::new(
            child
                .stdout
                .take()
                .ok_or_else(|| Failure::new("helper_protocol", "stdout missing"))?,
        )
        .lines();
        let mut sent = None;
        let mut last_heartbeat = Instant::now();
        let mut safe_since = None;
        let mut acknowledged = 0;
        loop {
            let target = receiver.borrow_and_update().clone();
            if target.quit {
                let mut frame = serde_json::to_vec(&target).unwrap();
                frame.push(b'\n');
                let _ =
                    tokio::time::timeout(Duration::from_millis(100), input.write_all(&frame)).await;
                if tokio::time::timeout(Duration::from_millis(800), child.wait())
                    .await
                    .is_err()
                {
                    kill(&mut child).await;
                }
                return Ok(());
            }
            if sent.as_ref() != Some(&target) {
                let mut frame = serde_json::to_vec(&target).unwrap();
                frame.push(b'\n');
                match tokio::time::timeout(Duration::from_millis(100), input.write_all(&frame))
                    .await
                {
                    Ok(Ok(())) => {}
                    _ => {
                        kill(&mut child).await;
                        return Err(Failure::new(
                            "helper_timeout",
                            "Helper command pipe is blocked",
                        ));
                    }
                }
                if !target.enabled || target.percent == 100 {
                    safe_since.get_or_insert_with(Instant::now);
                } else {
                    safe_since = None;
                }
                sent = Some(target.clone());
            }
            if safe_since.is_some_and(|time| time.elapsed() >= Duration::from_secs(1))
                && acknowledged < target.revision
            {
                kill(&mut child).await;
                self.publish(
                    app,
                    Report {
                        revision: target.revision,
                        phase: "disabled".into(),
                        applied_percent: Some(100),
                        error: Some(Failure::new(
                            "helper_timeout",
                            "Restore timed out; owned helper terminated to remove its overlay",
                        )),
                    },
                );
                return Err(Failure::new(
                    "helper_timeout",
                    "Restore timed out; owned helper terminated",
                ));
            }
            if last_heartbeat.elapsed() > Duration::from_secs(10) {
                kill(&mut child).await;
                return Err(Failure::new(
                    "helper_timeout",
                    "No helper response for 10 seconds",
                ));
            }
            tokio::select! {
                line=output.next_line()=>{
                    let line=match line {
                        Ok(Some(line)) if line.len()<=65536=>line,
                        _=>{kill(&mut child).await;return Err(Failure::new("helper_exited","Helper output closed or exceeded protocol limit"));}
                    };
                    let report:Report=match serde_json::from_str(&line) {
                        Ok(value)=>value,
                        Err(e)=>{kill(&mut child).await;return Err(Failure::new("helper_protocol",e));}
                    };
                    last_heartbeat=Instant::now();
                    if report.revision==receiver.borrow().revision {
                        if report.applied_percent==Some(100) {acknowledged=report.revision;safe_since=None;}
                        self.publish(app,report);
                    }
                },
                _=receiver.changed()=>{},
                _=tokio::time::sleep(Duration::from_millis(50))=>{},
            }
        }
    }
}

fn helper_path() -> Result<std::path::PathBuf, Failure> {
    let name = "steamvr-brightness-helper";
    let exe = std::env::current_exe().map_err(|e| Failure::new("helper_missing", e))?;
    #[cfg(debug_assertions)]
    {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("bin")
            .join(format!("{name}-x86_64-pc-windows-msvc.exe"));
        if path.exists() {
            return Ok(path);
        }
    }
    Ok(exe.with_file_name(format!("{name}.exe")))
}

async fn kill(child: &mut Child) {
    let _ = child.start_kill();
    let _ = tokio::time::timeout(Duration::from_millis(200), child.wait()).await;
}

#[cfg(windows)]
fn own_job(child: &Child) -> Result<std::os::windows::io::OwnedHandle, Failure> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle};
    use windows_sys::Win32::System::JobObjects::*;
    let raw = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if raw.is_null() {
        return Err(Failure::new("helper_job", std::io::Error::last_os_error()));
    }
    let job = unsafe { std::os::windows::io::OwnedHandle::from_raw_handle(raw) };
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let process = child
        .raw_handle()
        .ok_or_else(|| Failure::new("helper_job", "child has no process handle"))?;
    let configured = unsafe {
        SetInformationJobObject(
            job.as_raw_handle(),
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of_val(&limits) as u32,
        )
    };
    if configured == 0 || unsafe { AssignProcessToJobObject(job.as_raw_handle(), process) } == 0 {
        return Err(Failure::new("helper_job", std::io::Error::last_os_error()));
    }
    Ok(job)
}

#[derive(Default)]
struct RestartBudget {
    failures: VecDeque<Instant>,
}
impl RestartBudget {
    fn record(&mut self, now: Instant) {
        self.failures.push_back(now);
    }
    fn exhausted(&mut self, now: Instant) -> bool {
        while self
            .failures
            .front()
            .is_some_and(|t| now.duration_since(*t) >= Duration::from_secs(30))
        {
            self.failures.pop_front();
        }
        self.failures.len() >= 3
    }
}

#[tauri::command]
pub fn get_steamvr_status(state: State<'_, SteamVr>) -> Status {
    state.status()
}
#[tauri::command]
pub fn set_steamvr_enabled(
    state: State<'_, SteamVr>,
    enabled: bool,
    percent: u8,
    request: u64,
) -> Result<Status, String> {
    if percent > 100 {
        return Err("SteamVR brightness must be between 0 and 100".into());
    }
    state.change(request, |d| {
        d.enabled = enabled;
        d.percent = percent;
    })
}
#[tauri::command]
pub fn set_steamvr_percent(
    state: State<'_, SteamVr>,
    percent: u8,
    request: u64,
) -> Result<Status, String> {
    if percent > 100 {
        return Err("SteamVR brightness must be between 0 and 100".into());
    }
    state.change(request, |d| d.percent = percent)
}
#[tauri::command]
pub fn restore_steamvr(state: State<'_, SteamVr>, request: u64) -> Result<Status, String> {
    state.change(request, |d| {
        d.enabled = false;
        d.percent = 100;
    })
}
#[tauri::command]
pub fn retry_steamvr(state: State<'_, SteamVr>, request: u64) -> Result<Status, String> {
    state.change(request, |d| d.retry += 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_dim_requires_saved_opt_in_and_uses_the_latest_percent() {
        let state = SteamVr::default();
        let mut config = crate::config::AppConfig::default();
        state.auto_dim(&config);
        assert!(!state.status().enabled);
        assert_eq!(state.status().revision, 0);
        config.auto_dim_steamvr = true;
        config.steamvr_brightness_percent = 73;
        config.auto_dim_steamvr_percent = 10;
        state.change(1000, |d| d.percent = 50).unwrap();
        state.auto_dim(&config);
        assert!(state.status().enabled);
        assert_eq!(state.status().percent, 10);
        assert_eq!(state.status().revision, 1001);
        assert_eq!(config.steamvr_brightness_percent, 73);
        state
            .change(1002, |d| {
                d.enabled = false;
                d.percent = 100;
            })
            .unwrap();
        assert!(!state.status().enabled);
        assert_eq!(state.status().percent, 100);
    }

    #[test]
    fn auto_dim_does_not_override_shutdown_or_accept_invalid_percent() {
        let state = SteamVr::default();
        let mut config = crate::config::AppConfig {
            auto_dim_steamvr: true,
            auto_dim_steamvr_percent: 101,
            ..crate::config::AppConfig::default()
        };
        state.auto_dim(&config);
        assert!(!state.status().enabled);
        config.auto_dim_steamvr_percent = 0;
        state.begin_shutdown();
        state.auto_dim(&config);
        assert!(!state.status().enabled);
    }

    #[cfg(windows)]
    fn sleeper() -> Child {
        Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 60",
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .creation_flags(0x08000000)
            .kill_on_drop(true)
            .spawn()
            .unwrap()
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn job_close_kills_only_the_owned_process() {
        let mut unrelated = sleeper();
        let mut owned = sleeper();
        let job = own_job(&owned).unwrap();
        drop(job);
        assert!(
            tokio::time::timeout(Duration::from_secs(2), owned.wait())
                .await
                .is_ok()
        );
        assert!(unrelated.try_wait().unwrap().is_none());
        kill(&mut unrelated).await;
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn forced_recovery_terminates_a_nonresponsive_helper() {
        let mut owned = sleeper();
        let _job = own_job(&owned).unwrap();
        let start = Instant::now();
        kill(&mut owned).await;
        assert!(owned.try_wait().unwrap().is_some());
        assert!(start.elapsed() < Duration::from_secs(1));
    }
    #[test]
    fn stale_slider_cannot_override_restore() {
        let state = SteamVr::default();
        state
            .change(1, |d| {
                d.enabled = true;
                d.percent = 0;
            })
            .unwrap();
        state
            .change(3, |d| {
                d.enabled = false;
                d.percent = 100;
            })
            .unwrap();
        state.change(2, |d| d.percent = 0).unwrap();
        assert_eq!(state.status().percent, 100);
        assert!(!state.status().enabled);
    }
    #[test]
    fn restart_budget_is_bounded_and_expires() {
        let now = Instant::now();
        let mut budget = RestartBudget::default();
        for _ in 0..3 {
            budget.record(now);
        }
        assert!(budget.exhausted(now));
        assert!(!budget.exhausted(now + Duration::from_secs(30)));
    }
}
