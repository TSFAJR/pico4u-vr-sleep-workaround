//! One owner for connection verification, retry backoff and cancellation.
//! Polling reads snapshots; it never queues network I/O ahead of user actions.
use crate::{
    adb_client::{run_adb_device_command, run_adb_host_command},
    config::load_config,
    connection::{self, ConnectionMode, ConnectionStatus, DeviceState},
    error::{AppError, ErrorCode, classify_connect_reply},
    state::AppState,
};
use std::{
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    sync::{Mutex as AsyncMutex, watch},
    time::Instant,
};

#[derive(Default)]
struct Session {
    key: String,
    serial: Option<String>,
    identity: Option<String>,
    checked: Option<Instant>,
    failures: u32,
    next: Option<Instant>,
    terminal: bool,
    status: ConnectionStatus,
}
impl Session {
    fn fresh(&self) -> bool {
        self.serial.is_some()
            && self
                .checked
                .is_some_and(|t| t.elapsed() < Duration::from_secs(2))
    }
    fn failed(&mut self, error: AppError, reconnect: bool) {
        self.serial = None;
        self.checked = None;
        self.failures = self.failures.saturating_add(1);
        self.terminal = !retryable(&error);
        self.next = Some(Instant::now() + retry_delay(self.failures));
        self.status.is_adb_tcp_connected = false;
        self.status.is_usb_connected = false;
        self.status.phase = if reconnect && !self.terminal {
            "reconnecting"
        } else {
            "disconnected"
        }
        .into();
        self.status.error = Some(error);
    }
}
pub struct ConnectionManager {
    gate: AsyncMutex<()>,
    connect_gate: AsyncMutex<()>,
    inner: Mutex<Session>,
    cancel: watch::Sender<u64>,
    closing: AtomicBool,
}
impl Default for ConnectionManager {
    fn default() -> Self {
        Self {
            gate: AsyncMutex::new(()),
            connect_gate: AsyncMutex::new(()),
            inner: Mutex::new(Session::default()),
            cancel: watch::channel(0).0,
            closing: AtomicBool::new(false),
        }
    }
}
fn cancelled() -> AppError {
    AppError::with(ErrorCode::Unknown, "connection_cancelled")
}
fn retry_delay(failures: u32) -> Duration {
    Duration::from_millis(match failures {
        0 => 0,
        1 => 500,
        2 => 1000,
        3 => 2000,
        4..=6 => 5000,
        _ => 10000,
    })
}
fn retryable(error: &AppError) -> bool {
    !matches!(
        error.code,
        ErrorCode::InvalidIp
            | ErrorCode::NotPico
            | ErrorCode::MultiplePico
            | ErrorCode::UsbUnauthorized
            | ErrorCode::WirelessUnauthorized
    )
}
fn key(mode: ConnectionMode, ip: &str) -> Result<String, AppError> {
    Ok(match mode {
        ConnectionMode::Wired => "usb".into(),
        ConnectionMode::Wireless => connection::endpoint(ip)?,
    })
}
impl ConnectionManager {
    pub fn cancellation(&self) -> watch::Receiver<u64> {
        self.cancel.subscribe()
    }
    pub fn cancel(&self) {
        self.cancel.send_modify(|n| *n = n.wrapping_add(1));
        let mut s = self.inner.lock().unwrap();
        s.next = None;
        // Cancelling work does not disconnect ADB. Keep the last verified
        // transport and its original timestamp; an expired check must still be
        // revalidated on the next start. Actual failures clear these in failed().
        if s.serial.is_some() {
            s.status.phase = "connected".into();
        } else {
            s.status.phase = "disconnected".into();
            s.status.is_adb_tcp_connected = false;
            s.status.is_usb_connected = false;
        }
    }
    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::SeqCst);
        self.cancel();
    }
    pub fn invalidate(&self, serial: &str, error: AppError) {
        let mut s = self.inner.lock().unwrap();
        if s.serial.as_deref() == Some(serial) {
            s.failed(error, true);
            // A failed keep-awake command should trigger the first reconnect immediately.
            s.next = None;
        }
    }
    pub fn snapshot(&self, mode: ConnectionMode, ip: &str) -> ConnectionStatus {
        let s = self.inner.lock().unwrap();
        if key(mode, ip).ok().as_deref() == Some(&s.key) {
            s.status.clone()
        } else {
            ConnectionStatus {
                phase: "checking".into(),
                ..Default::default()
            }
        }
    }
    pub fn refresh(app: AppHandle, mode: ConnectionMode, ip: String) {
        if app.state::<AppState>().is_running.load(Ordering::SeqCst)
            || app.state::<Self>().connect_gate.try_lock().is_err()
            || app.state::<Self>().gate.try_lock().is_err()
        {
            return;
        }
        tauri::async_runtime::spawn(async move {
            let _ = app
                .state::<Self>()
                .ensure(&app, mode, &ip, false, false)
                .await;
        });
    }
    fn publish(&self, app: &AppHandle) {
        let status = self.inner.lock().unwrap().status.clone();
        let _ = app.emit("adb-connection-status", status);
    }
    pub async fn ensure(
        &self,
        app: &AppHandle,
        mode: ConnectionMode,
        ip: &str,
        reconnect: bool,
        force: bool,
    ) -> Result<String, AppError> {
        let mut cancelled_rx = self.cancel.subscribe();
        if self.closing.load(Ordering::SeqCst) {
            return Err(cancelled());
        }
        tokio::select! {
            biased;
            _ = cancelled_rx.changed() => Err(cancelled()),
            result = self.ensure_inner(app, mode, ip, reconnect, force) => result,
        }
    }
    async fn ensure_inner(
        &self,
        app: &AppHandle,
        mode: ConnectionMode,
        ip: &str,
        reconnect: bool,
        force: bool,
    ) -> Result<String, AppError> {
        let target = key(mode, ip)?;
        let started = Instant::now();
        let result = self
            .attempt(&target, mode, reconnect, force, || async {
                self.publish(app);
                let mut result = self.probe(app, mode, &target).await;
                if result.as_ref().err().is_some_and(retryable)
                    && reconnect
                    && mode == ConnectionMode::Wireless
                {
                    let connected =
                        run_adb_host_command(Some(app), &format!("host:connect:{target}"))
                            .await
                            .map_err(AppError::from)
                            .and_then(|r| classify_connect_reply(&r));
                    result = match connected {
                        Ok(()) => self.probe(app, mode, &target).await,
                        Err(e) => Err(e),
                    };
                }
                result
            })
            .await;
        self.publish(app);
        if app.state::<AppState>().debug_mode.load(Ordering::Relaxed)
            && started.elapsed() > Duration::from_millis(10)
        {
            let _ = app.emit(
                "debug-log",
                format!(
                    "ADB connection: target={target}, elapsed_ms={}, result={:?}",
                    started.elapsed().as_millis(),
                    result
                ),
            );
        }
        result
    }
    async fn attempt<F, Fut>(
        &self,
        target: &str,
        mode: ConnectionMode,
        reconnect: bool,
        force: bool,
        work: F,
    ) -> Result<String, AppError>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<String, AppError>>,
    {
        let mut cancel = self.cancel.subscribe();
        let generation = *cancel.borrow();
        if self.closing.load(Ordering::SeqCst) {
            return Err(cancelled());
        }
        tokio::select! {
            biased;
            _ = cancel.changed() => Err(cancelled()),
            result = async {
        let _guard = self.gate.lock().await;
        {
            let mut s = self.inner.lock().unwrap();
            if s.key != target {
                *s = Session {
                    key: target.to_string(),
                    ..Default::default()
                };
            }
            if s.fresh() {
                return Ok(s.serial.clone().unwrap());
            }
            if force {
                // A user retry starts a new short retry sequence, not the old offline backoff.
                s.failures = 0;
                s.terminal = false;
                s.next = None;
            }
            if !force && (s.terminal || s.next.is_some_and(|t| t > Instant::now())) {
                return Err(s
                    .status
                    .error
                    .clone()
                    .unwrap_or_else(|| AppError::new(ErrorCode::WirelessNotFound)));
            }
            s.status.phase = if reconnect {
                "reconnecting"
            } else {
                "checking"
            }
            .into();
            s.status.attempt = s.failures.saturating_add(1);
        }
        let result = work().await;
        {
            let mut s = self.inner.lock().unwrap();
            if *self.cancel.borrow() != generation { return Err(cancelled()); }
            match &result {
                Ok(serial) => {
                    s.serial = Some(serial.clone());
                    s.checked = Some(Instant::now());
                    s.failures = 0;
                    s.next = None;
                    s.terminal = false;
                    s.status.phase = "connected".into();
                    s.status.error = None;
                    s.status.is_adb_tcp_connected = mode == ConnectionMode::Wireless;
                    s.status.is_usb_connected |= mode == ConnectionMode::Wired;
                    if mode == ConnectionMode::Wireless {
                        s.status.wifi_ip = Some(target.split(':').next().unwrap_or("").into());
                        s.status.is_wifi_ip_available = true;
                    }
                }
                Err(e) => s.failed(e.clone(), reconnect),
            }
        }
        result
            } => result,
        }
    }
    async fn probe(
        &self,
        app: &AppHandle,
        mode: ConnectionMode,
        target: &str,
    ) -> Result<String, AppError> {
        let generation = *self.cancel.borrow();
        let output = run_adb_host_command(Some(app), "host:devices-l").await?;
        let rows = connection::parse_device_rows(&output);
        let candidates: Vec<_> = rows
            .iter()
            .filter(|r| {
                connection::matches_transport(
                    &r.serial,
                    mode,
                    if mode == ConnectionMode::Wireless {
                        target
                    } else {
                        ""
                    },
                )
            })
            .collect();
        if mode == ConnectionMode::Wired
            && candidates
                .iter()
                .filter(|r| {
                    r.state == DeviceState::Device
                        && r.model.as_deref().is_none_or(connection::is_pico)
                })
                .count()
                > 1
        {
            return Err(AppError::new(ErrorCode::MultiplePico));
        }
        let row = candidates.iter().find(|r| {
            r.state == DeviceState::Device && r.model.as_deref().is_none_or(connection::is_pico)
        });
        let Some(row) = row else {
            let code = if candidates
                .iter()
                .any(|r| r.state == DeviceState::Unauthorized)
            {
                if mode == ConnectionMode::Wireless {
                    ErrorCode::WirelessUnauthorized
                } else {
                    ErrorCode::UsbUnauthorized
                }
            } else if candidates.iter().any(|r| r.state == DeviceState::Device) {
                ErrorCode::NotPico
            } else if mode == ConnectionMode::Wireless {
                ErrorCode::WirelessNotFound
            } else {
                ErrorCode::UsbNotFound
            };
            return Err(AppError::new(code));
        };
        // One small shell request verifies both liveness and physical identity. A stale
        // ADB "device" row alone is not evidence that the headset is reachable.
        let output = tokio::time::timeout(
            Duration::from_secs(2),
            run_adb_device_command(
                Some(app),
                Some(&row.serial),
                "shell:getprop ro.product.model; getprop ro.serialno",
            ),
        )
        .await
        .map_err(|_| AppError::new(ErrorCode::Timeout))??;
        let mut lines = output.lines();
        if !lines.next().is_some_and(connection::is_pico) {
            return Err(AppError::new(ErrorCode::NotPico));
        }
        let identity = lines.next().unwrap_or("").trim();
        if identity.is_empty() || identity == "unknown" {
            return Err(AppError::with(
                ErrorCode::DeviceLost,
                "Headset identity unavailable",
            ));
        }
        let mut s = self.inner.lock().unwrap();
        if *self.cancel.borrow() != generation {
            return Err(cancelled());
        }
        if s.identity.as_deref().is_some_and(|id| id != identity) {
            return Err(AppError::with(
                ErrorCode::NotPico,
                "Device identity changed; reconnect cancelled to protect the original headset",
            ));
        }
        s.identity = Some(identity.into());
        // USB presence is optional metadata; no additional shell request is needed.
        s.status.is_usb_connected = rows
            .iter()
            .any(|r| r.serial == identity && r.state == DeviceState::Device);
        Ok(row.serial.clone())
    }
    pub async fn connect(
        &self,
        app: &AppHandle,
        mode: ConnectionMode,
        ip: &str,
    ) -> Result<(), AppError> {
        let mut stopped = self.cancel.subscribe();
        tokio::select! {
            biased;
            _ = stopped.changed() => Err(cancelled()),
            result = tokio::time::timeout(Duration::from_secs(20), async {
                let _guard = self.connect_gate.lock().await;
                let mut cancel = self.cancel.subscribe();
        for attempt in 1..=3 {
            let result = self.ensure(app, mode, ip, true, attempt == 1).await;
            match result {
                Ok(_) => return Ok(()),
                Err(e)
                    if attempt == 3
                        || !retryable(&e)
                        || e.detail.as_deref() == Some("connection_cancelled") =>
                {
                    return Err(e);
                }
                _ => {}
            }
            tokio::select! { biased; _ = cancel.changed() => return Err(cancelled()), _ = tokio::time::sleep(retry_delay(attempt)) => {} }
        }
        unreachable!()
            }) => result.map_err(|_| AppError::new(ErrorCode::Timeout))?,
        }
    }
    pub fn start(app: AppHandle) {
        tauri::async_runtime::spawn(async move {
            loop {
                let manager = app.state::<Self>();
                if manager.closing.load(Ordering::SeqCst) {
                    break;
                }
                let c = load_config(&app);
                if let Some(mode) = c.last_connection_mode {
                    let active = app.state::<AppState>().is_running.load(Ordering::SeqCst);
                    // Background work never joins a queued user request.
                    if active
                        && manager.connect_gate.try_lock().is_ok()
                        && manager.gate.try_lock().is_ok()
                    {
                        let _ = manager
                            .ensure(&app, mode, &c.ip_address, active, false)
                            .await;
                    }
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backoff_is_bounded_and_fast_initially() {
        assert_eq!(
            (1..=8)
                .map(|n| retry_delay(n).as_millis())
                .collect::<Vec<_>>(),
            vec![500, 1000, 2000, 5000, 5000, 5000, 10000, 10000]
        );
        assert_eq!(retry_delay(u32::MAX), Duration::from_secs(10));
    }
    #[test]
    fn authorization_and_wrong_device_require_user_action() {
        for code in [
            ErrorCode::WirelessUnauthorized,
            ErrorCode::UsbUnauthorized,
            ErrorCode::NotPico,
            ErrorCode::InvalidIp,
            ErrorCode::MultiplePico,
        ] {
            assert!(!retryable(&AppError::new(code)));
        }
        for code in [
            ErrorCode::Timeout,
            ErrorCode::WirelessNotFound,
            ErrorCode::WirelessRefused,
        ] {
            assert!(retryable(&AppError::new(code)));
        }
    }
    #[test]
    fn failure_invalidates_connection_but_preserves_identity() {
        let mut s = Session {
            serial: Some("1.2.3.4:5555".into()),
            identity: Some("headset1".into()),
            checked: Some(Instant::now()),
            ..Default::default()
        };
        assert!(s.fresh());
        s.failed(AppError::new(ErrorCode::Timeout), true);
        assert!(!s.fresh());
        assert_eq!(s.identity.as_deref(), Some("headset1"));
        assert_eq!(s.status.phase, "reconnecting");
        assert!(s.next.is_some());
    }
    #[tokio::test]
    async fn cancellation_interrupts_waiting_for_gate() {
        let m = ConnectionManager::default();
        let _guard = m.gate.lock().await;
        let mut cancel = m.cancel.subscribe();
        m.cancel();
        tokio::select! { biased; _=cancel.changed()=>{}, _=m.gate.lock()=>panic!("must cancel before lock") }
        assert_eq!(m.inner.lock().unwrap().status.phase, "disconnected");
    }
    #[tokio::test]
    async fn concurrent_requests_share_one_verified_result() {
        use std::sync::{Arc, atomic::AtomicUsize};
        let m = Arc::new(ConnectionManager::default());
        let count = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();
        for _ in 0..8 {
            let m = m.clone();
            let count = count.clone();
            tasks.push(tokio::spawn(async move {
                m.attempt(
                    "1.2.3.4:5555",
                    ConnectionMode::Wireless,
                    true,
                    true,
                    || async {
                        count.fetch_add(1, Ordering::SeqCst);
                        tokio::time::sleep(Duration::from_millis(10)).await;
                        Ok("1.2.3.4:5555".into())
                    },
                )
                .await
            }));
        }
        for task in tasks {
            assert!(task.await.unwrap().is_ok());
        }
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn failed_request_obeys_backoff_and_explicit_retry() {
        let m = ConnectionManager::default();
        let first = m
            .attempt("usb", ConnectionMode::Wired, true, false, || async {
                Err(AppError::new(ErrorCode::UsbUnauthorized))
            })
            .await;
        assert!(first.is_err());
        let blocked = m
            .attempt("usb", ConnectionMode::Wired, true, false, || async {
                panic!("terminal failure must not retry")
            })
            .await;
        assert!(blocked.is_err());
        assert!(
            m.attempt("usb", ConnectionMode::Wired, true, true, || async {
                Ok("headset".into())
            })
            .await
            .is_ok()
        );
        m.invalidate("headset", AppError::new(ErrorCode::Timeout));
        assert!(
            m.attempt("usb", ConnectionMode::Wired, true, false, || async {
                Err(AppError::new(ErrorCode::Timeout))
            })
            .await
            .is_err()
        );
        assert!(
            m.attempt("usb", ConnectionMode::Wired, true, false, || async {
                panic!("backoff must prevent extra I/O")
            })
            .await
            .is_err()
        );
    }
    #[tokio::test]
    async fn cancelled_network_work_releases_gate_and_cannot_commit() {
        use std::sync::Arc;
        let m = Arc::new(ConnectionManager::default());
        let (tx, rx) = tokio::sync::oneshot::channel();
        let worker = m.clone();
        let task = tokio::spawn(async move {
            worker
                .attempt("usb", ConnectionMode::Wired, true, true, || async {
                    tx.send(()).unwrap();
                    std::future::pending::<Result<String, AppError>>().await
                })
                .await
        });
        rx.await.unwrap();
        m.cancel();
        assert_eq!(
            task.await.unwrap().unwrap_err().detail.as_deref(),
            Some("connection_cancelled")
        );
        assert!(m.gate.try_lock().is_ok());
        assert!(
            m.attempt("usb", ConnectionMode::Wired, true, true, || async {
                Ok("headset".into())
            })
            .await
            .is_ok()
        );
    }
    #[tokio::test]
    async fn result_finishing_after_cancel_is_discarded() {
        let m = ConnectionManager::default();
        let result = m
            .attempt("usb", ConnectionMode::Wired, true, true, || async {
                m.cancel();
                Ok("stale".into())
            })
            .await;
        assert!(result.is_err());
        assert!(m.inner.lock().unwrap().serial.is_none());
    }
    #[tokio::test]
    async fn target_change_does_not_reuse_previous_device_cache() {
        let m = ConnectionManager::default();
        assert!(
            m.attempt("old:5555", ConnectionMode::Wireless, true, true, || async {
                Ok("old:5555".into())
            })
            .await
            .is_ok()
        );
        m.inner.lock().unwrap().identity = Some("old-headset".into());
        assert!(
            m.attempt("new:5555", ConnectionMode::Wireless, true, true, || async {
                assert!(m.inner.lock().unwrap().identity.is_none());
                Ok("new:5555".into())
            })
            .await
            .is_ok()
        );
        m.shutdown();
        assert!(
            m.attempt("new:5555", ConnectionMode::Wireless, true, true, || async {
                panic!("shutdown must forbid I/O")
            })
            .await
            .is_err()
        );
    }
    #[tokio::test]
    async fn stopping_preserves_connection_for_immediate_restart() {
        let m = ConnectionManager::default();
        for (mode, target, serial) in [
            (
                ConnectionMode::Wireless,
                "192.168.1.2:5555",
                "192.168.1.2:5555",
            ),
            (ConnectionMode::Wired, "usb", "pico-usb"),
        ] {
            m.attempt(target, mode, true, true, || async { Ok(serial.into()) })
                .await
                .unwrap();
            let checked = m.inner.lock().unwrap().checked;
            m.cancel();
            let status = m.inner.lock().unwrap().status.clone();
            assert_eq!(status.phase, "connected");
            assert_eq!(
                status.is_adb_tcp_connected,
                mode == ConnectionMode::Wireless
            );
            assert_eq!(status.is_usb_connected, mode == ConnectionMode::Wired);
            assert_eq!(m.inner.lock().unwrap().checked, checked);
            assert_eq!(
                m.attempt(target, mode, true, true, || async {
                    panic!("fresh restart must reuse verification")
                })
                .await
                .unwrap(),
                serial
            );
        }
    }
    #[tokio::test]
    async fn cancelling_does_not_refresh_old_verification_or_hide_a_real_failure() {
        let m = ConnectionManager::default();
        m.attempt("usb", ConnectionMode::Wired, true, true, || async {
            Ok("pico".into())
        })
        .await
        .unwrap();
        m.inner.lock().unwrap().checked = Some(Instant::now() - Duration::from_secs(3));
        m.cancel();
        assert!(!m.inner.lock().unwrap().fresh());
        assert!(
            m.attempt("usb", ConnectionMode::Wired, true, true, || async {
                Err(AppError::new(ErrorCode::UsbNotFound))
            })
            .await
            .is_err()
        );
        m.cancel();
        let s = m.inner.lock().unwrap();
        assert!(s.serial.is_none());
        assert!(!s.status.is_usb_connected);
        assert_eq!(s.status.phase, "disconnected");
        assert!(s.status.error.is_some());
    }
}
