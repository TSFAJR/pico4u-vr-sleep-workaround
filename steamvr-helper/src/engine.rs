use crate::detector::{Detector, Sample};
use crate::protocol::{Desired, Failure, Report};
use std::time::Duration;

pub trait Backend {
    fn sample(&self) -> Option<Sample> {
        None
    }
    fn quit_requested(&self) -> Result<bool, Failure>;
    fn prepare(&mut self) -> Result<(), Failure>;
    fn resize(&self) -> Result<(), Failure>;
    fn apply(&self, percent: u8) -> Result<(), Failure>;
    fn clear_overlay(&mut self);
}

pub struct Engine<B> {
    session: Option<B>,
    detector: Detector,
    detection: crate::protocol::DetectionReport,
    next_report: Duration,
    fade: Option<(u8, u32, Duration, u8)>,
    blocked: bool,
    retry: u64,
    enabled: bool,
    next_connect: Duration,
    last_geometry: Duration,
    last_applied: Option<u8>,
    last_error: Option<Failure>,
}

impl<B: Backend> Default for Engine<B> {
    fn default() -> Self {
        Self {
            session: None,
            detector: Detector::default(),
            detection: Default::default(),
            next_report: Duration::ZERO,
            fade: None,
            blocked: false,
            retry: 0,
            enabled: false,
            next_connect: Duration::ZERO,
            last_geometry: Duration::ZERO,
            last_applied: Some(100),
            last_error: None,
        }
    }
}

impl<B: Backend> Engine<B> {
    pub fn step(
        &mut self,
        desired: &Desired,
        now: Duration,
        connect: impl FnOnce() -> Result<B, Failure>,
        current: impl Fn() -> bool,
    ) -> Report {
        let mut report = Report {
            revision: desired.revision,
            ..Report::default()
        };
        let monitoring = desired.detector.enabled || desired.detector.calibrating;
        if (!desired.enabled && !monitoring) || desired.quit {
            self.detector.reset();
            self.fade = None;
            // Drop performs Hide -> Destroy -> Shutdown before acknowledging.
            self.session = None;
            self.blocked = false;
            self.enabled = false;
            self.last_applied = Some(100);
            self.last_error = None;
            self.next_connect = Duration::ZERO;
            return report;
        }
        if !self.enabled || self.retry != desired.retry {
            self.blocked = false;
            self.next_connect = Duration::ZERO;
        }
        self.enabled = true;
        self.retry = desired.retry;
        if let Some(session) = self.session.as_ref() {
            match session.quit_requested() {
                Ok(false) => {}
                result => {
                    self.session = None;
                    self.detector.reset();
                    self.fade = None;
                    self.blocked = false;
                    self.last_applied = None;
                    self.next_connect = now + Duration::from_secs(2);
                    self.last_error = Some(match result {
                        Err(e) => e,
                        _ => Failure::new(
                            "runtime_unavailable",
                            "SteamVR session ended; waiting to reconnect",
                        ),
                    });
                }
            }
        }
        if self.session.is_none() && !self.blocked && now >= self.next_connect {
            match connect() {
                Ok(session) => {
                    self.session = Some(session);
                    self.last_applied = None;
                    self.last_error = None;
                }
                Err(error) => {
                    self.blocked = error.code != "runtime_unavailable";
                    self.last_error = Some(error);
                    self.next_connect = now + Duration::from_secs(2);
                }
            }
        }
        let detection = self.detector.sample(
            &desired.detector,
            now,
            self.session.as_ref().and_then(|s| s.sample()),
        );
        if now >= self.next_report
            || detection.generation != self.detection.generation
            || detection.valid != self.detection.valid
        {
            self.detection = detection;
            self.next_report = now + Duration::from_secs(1);
        }
        report.detection = self.detection.clone();
        if !desired.enabled {
            if let Some(s) = self.session.as_mut() {
                s.clear_overlay();
            }
            self.last_applied = Some(100);
            self.fade = None;
        }
        if let Some(session) = self
            .session
            .as_mut()
            .filter(|_| !self.blocked && desired.enabled)
        {
            // Initializing OpenVR can be slow. Never show a stale request once
            // the input thread has received disable/restore or a newer value.
            if !current() {
                report.applied_percent = self.last_applied;
                return report;
            }
            if self
                .fade
                .is_none_or(|f| f.0 != desired.percent || f.1 != desired.fade_ms)
            {
                self.fade = Some((
                    desired.percent,
                    desired.fade_ms,
                    now,
                    self.last_applied.unwrap_or(100),
                ));
            }
            let (_, _, start, from) = self.fade.unwrap();
            let progress = if desired.fade_ms == 0 {
                1.0
            } else {
                (now.saturating_sub(start).as_secs_f64() * 1000.0 / f64::from(desired.fade_ms))
                    .min(1.0)
            };
            let percent = (f64::from(from)
                + (f64::from(desired.percent) - f64::from(from)) * progress)
                .round() as u8;
            let result = (|| {
                if percent < 100 {
                    session.prepare()?;
                }
                if now >= self.last_geometry + Duration::from_secs(1) {
                    session.resize()?;
                    self.last_geometry = now;
                }
                if !current() {
                    return Ok(());
                }
                session.apply(percent)?;
                self.last_applied = Some(percent);
                Ok::<(), Failure>(())
            })();
            if let Err(error) = result {
                // Keep only the runtime connection to observe its quit event.
                // No failed overlay remains and no creation repeats until Retry
                // or a genuinely new SteamVR session.
                session.clear_overlay();
                self.blocked = true;
                self.last_applied = None;
                self.last_error = Some(error);
            }
        }
        report.phase = if self.blocked {
            "error"
        } else if self.session.is_some() && !desired.enabled {
            "disabled"
        } else if self.session.is_some() {
            "active"
        } else {
            "waiting"
        }
        .into();
        report.applied_percent = self.last_applied;
        report.error = self.last_error.clone();
        report
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, rc::Rc};
    struct Fake {
        alive: Rc<Cell<usize>>,
        quit: Rc<Cell<bool>>,
        fail: bool,
    }
    impl Drop for Fake {
        fn drop(&mut self) {
            self.alive.set(self.alive.get() - 1);
        }
    }
    impl Backend for Fake {
        fn quit_requested(&self) -> Result<bool, Failure> {
            Ok(self.quit.get())
        }
        fn prepare(&mut self) -> Result<(), Failure> {
            if self.fail {
                Err(Failure::new("overlay_conflict", "17"))
            } else {
                Ok(())
            }
        }
        fn resize(&self) -> Result<(), Failure> {
            Ok(())
        }
        fn apply(&self, _: u8) -> Result<(), Failure> {
            Ok(())
        }
        fn clear_overlay(&mut self) {}
    }
    #[test]
    fn disabled_never_initializes_and_failure_never_recreates_without_retry() {
        let mut engine = Engine::<Fake>::default();
        let mut d = Desired::default();
        let result = engine.step(
            &d,
            Duration::ZERO,
            || panic!("must not initialize"),
            || true,
        );
        assert_eq!(result.applied_percent, Some(100));
        d.enabled = true;
        d.percent = 0;
        let alive = Rc::new(Cell::new(0));
        let quit = Rc::new(Cell::new(false));
        alive.set(1);
        let result = engine.step(
            &d,
            Duration::ZERO,
            || {
                Ok(Fake {
                    alive: alive.clone(),
                    quit: quit.clone(),
                    fail: true,
                })
            },
            || true,
        );
        assert_eq!(result.phase, "error");
        assert_eq!(alive.get(), 1);
        engine.step(
            &d,
            Duration::from_secs(20),
            || panic!("must not loop"),
            || true,
        );
        quit.set(true);
        assert_eq!(
            engine
                .step(&d, Duration::from_secs(21), || panic!(), || true)
                .phase,
            "waiting"
        );
        assert_eq!(alive.get(), 0);
        quit.set(false);
        let recovered = engine.step(
            &d,
            Duration::from_secs(23),
            || {
                alive.set(1);
                Ok(Fake {
                    alive: alive.clone(),
                    quit: quit.clone(),
                    fail: false,
                })
            },
            || true,
        );
        assert_eq!(recovered.applied_percent, Some(0));
        d.enabled = false;
        assert_eq!(
            engine
                .step(&d, Duration::from_secs(24), || panic!(), || true)
                .applied_percent,
            Some(100)
        );
    }
    #[test]
    fn restart_reconnects_once_and_restore_drops_session() {
        let mut engine = Engine::<Fake>::default();
        let mut d = Desired {
            enabled: true,
            percent: 10,
            ..Desired::default()
        };
        let alive = Rc::new(Cell::new(0));
        let quit = Rc::new(Cell::new(false));
        let make = || {
            alive.set(alive.get() + 1);
            Ok(Fake {
                alive: alive.clone(),
                quit: quit.clone(),
                fail: false,
            })
        };
        assert_eq!(
            engine
                .step(&d, Duration::ZERO, make, || true)
                .applied_percent,
            Some(10)
        );
        for i in 1..10 {
            engine.step(
                &d,
                Duration::from_millis(i * 20),
                || panic!("duplicate session"),
                || true,
            );
        }
        assert_eq!(alive.get(), 1);
        quit.set(true);
        assert_eq!(
            engine
                .step(&d, Duration::from_secs(1), || panic!(), || true)
                .phase,
            "waiting"
        );
        assert_eq!(alive.get(), 0);
        quit.set(false);
        assert_eq!(
            engine
                .step(&d, Duration::from_secs(3), make, || true)
                .applied_percent,
            Some(10)
        );
        d.enabled = false;
        d.percent = 100;
        d.revision += 1;
        assert_eq!(
            engine
                .step(&d, Duration::from_secs(4), || panic!(), || true)
                .applied_percent,
            Some(100)
        );
        assert_eq!(alive.get(), 0);
    }
    #[test]
    fn stale_initialization_is_never_applied() {
        let mut engine = Engine::<Fake>::default();
        let d = Desired {
            enabled: true,
            percent: 0,
            ..Desired::default()
        };
        let alive = Rc::new(Cell::new(1));
        let r = engine.step(
            &d,
            Duration::ZERO,
            || {
                Ok(Fake {
                    alive,
                    quit: Rc::new(Cell::new(false)),
                    fail: true,
                })
            },
            || false,
        );
        assert_ne!(r.applied_percent, Some(0));
        assert!(r.error.is_none());
    }
    #[test]
    fn monitoring_keeps_one_session_without_creating_overlay_and_restore_cancels_fade() {
        use std::cell::RefCell;
        struct Monitor {
            applied: Rc<RefCell<Vec<u8>>>,
            created: Rc<Cell<u32>>,
            prepared: bool,
        }
        impl Backend for Monitor {
            fn quit_requested(&self) -> Result<bool, Failure> {
                Ok(false)
            }
            fn sample(&self) -> Option<Sample> {
                Some(Sample {
                    position: [0.; 3],
                    quaternion: [1., 0., 0., 0.],
                    valid: true,
                    activity: false,
                    controllers_available: true,
                    presence_available: true,
                })
            }
            fn prepare(&mut self) -> Result<(), Failure> {
                if !self.prepared {
                    self.created.set(self.created.get() + 1);
                    self.prepared = true;
                }
                Ok(())
            }
            fn resize(&self) -> Result<(), Failure> {
                Ok(())
            }
            fn apply(&self, p: u8) -> Result<(), Failure> {
                self.applied.borrow_mut().push(p);
                Ok(())
            }
            fn clear_overlay(&mut self) {
                self.prepared = false;
            }
        }
        let applied = Rc::new(RefCell::new(Vec::new()));
        let created = Rc::new(Cell::new(0));
        let mut e = Engine::default();
        let mut d = Desired::default();
        d.detector.enabled = true;
        d.detector.generation = 1;
        let r = e.step(
            &d,
            Duration::ZERO,
            || {
                Ok(Monitor {
                    applied: applied.clone(),
                    created: created.clone(),
                    prepared: false,
                })
            },
            || true,
        );
        assert!(r.detection.valid);
        assert_eq!(created.get(), 0);
        assert!(applied.borrow().is_empty());
        d.enabled = true;
        d.percent = 0;
        d.fade_ms = 3000;
        d.revision = 1;
        e.step(
            &d,
            Duration::from_secs(1),
            || panic!("second session"),
            || true,
        );
        e.step(&d, Duration::from_secs(2), || panic!(), || true);
        assert!(applied.borrow().last().unwrap() > &0);
        assert_eq!(created.get(), 1);
        d.enabled = false;
        d.percent = 100;
        d.fade_ms = 0;
        d.revision = 2;
        let r = e.step(&d, Duration::from_millis(2050), || panic!(), || true);
        assert_eq!(r.applied_percent, Some(100));
        assert!(r.detection.valid);
        let count = applied.borrow().len();
        e.step(&d, Duration::from_secs(5), || panic!(), || true);
        assert_eq!(count, applied.borrow().len());
        assert_eq!(created.get(), 1);
    }
}
