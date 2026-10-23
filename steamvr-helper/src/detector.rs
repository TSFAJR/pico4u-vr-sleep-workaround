//! Bounded, monotonic pose statistics. Noise estimates are not a physiological sleep classifier.
use crate::protocol::{DetectionReport, DetectorConfig, Failure, MotionWindow};
use std::{collections::VecDeque, time::Duration};
#[derive(Clone, Copy)]
pub struct Sample {
    pub position: [f64; 3],
    pub quaternion: [f64; 4],
    pub valid: bool,
    pub activity: bool,
    pub controllers_available: bool,
    pub presence_available: bool,
}
#[derive(Default)]
struct Bucket {
    time: u64,
    distance: f64,
    rotation: f64,
    corrected_distance: f64,
    corrected_rotation: f64,
}
#[derive(Default)]
pub struct Detector {
    config: Option<DetectorConfig>,
    previous: Option<(Duration, Sample)>,
    buckets: VecDeque<Bucket>,
    since: Option<Duration>,
    calibration: Vec<[f64; 2]>,
    calibration_start: Option<Duration>,
    report: DetectionReport,
}
pub fn angle(a: [f64; 4], b: [f64; 4]) -> Option<f64> {
    let norm = |q: [f64; 4]| q.iter().map(|v| v * v).sum::<f64>().sqrt();
    let (na, nb) = (norm(a), norm(b));
    if !na.is_finite() || !nb.is_finite() || na < 1e-9 || nb < 1e-9 {
        return None;
    }
    let dot = a.iter().zip(b).map(|(x, y)| x * y).sum::<f64>() / (na * nb);
    Some(2.0 * dot.abs().clamp(0.0, 1.0).acos().to_degrees())
}
pub fn quaternion(matrix: [[f32; 4]; 3]) -> [f64; 4] {
    let m = matrix.map(|r| r.map(f64::from));
    let trace = m[0][0] + m[1][1] + m[2][2];
    if trace > 0.0 {
        let s = (trace + 1.0).sqrt() * 2.0;
        return [
            s / 4.0,
            (m[2][1] - m[1][2]) / s,
            (m[0][2] - m[2][0]) / s,
            (m[1][0] - m[0][1]) / s,
        ];
    }
    let i = if m[0][0] > m[1][1] && m[0][0] > m[2][2] {
        0
    } else if m[1][1] > m[2][2] {
        1
    } else {
        2
    };
    let j = (i + 1) % 3;
    let k = (i + 2) % 3;
    let s = (1.0 + m[i][i] - m[j][j] - m[k][k]).max(0.0).sqrt() * 2.0;
    if s < 1e-12 {
        return [0.; 4];
    }
    let mut q = [0.; 4];
    q[0] = (m[k][j] - m[j][k]) / s;
    q[i + 1] = s / 4.0;
    q[j + 1] = (m[j][i] + m[i][j]) / s;
    q[k + 1] = (m[k][i] + m[i][k]) / s;
    q
}

impl Detector {
    pub fn reset(&mut self) {
        *self = Self::default();
    }
    pub fn sample(
        &mut self,
        config: &DetectorConfig,
        now: Duration,
        sample: Option<Sample>,
    ) -> DetectionReport {
        if self.config.as_ref() != Some(config) {
            self.reset();
            self.config = Some(config.clone());
            self.report.generation = config.generation;
        }
        if !config.enabled && !config.calibrating {
            return self.report.clone();
        }
        let valid = sample.is_some_and(|s| {
            s.valid
                && s.position.iter().all(|v| v.is_finite())
                && angle(s.quaternion, s.quaternion).is_some()
        });
        if !valid {
            self.previous = None;
            self.buckets.clear();
            self.since = None;
            self.calibration.clear();
            self.calibration_start = None;
            self.report = DetectionReport {
                generation: config.generation,
                error: Some(Failure::new(
                    "pose_invalid",
                    "Tracking or headset presence unavailable",
                )),
                ..Default::default()
            };
            return self.report.clone();
        }
        let s = sample.unwrap();
        self.report.valid = true;
        self.report.error = None;
        self.report.controllers_available = s.controllers_available;
        self.report.presence_available = s.presence_available;
        let mut movement = false;
        if let Some((last, p)) = self.previous {
            let dt = now.saturating_sub(last).as_secs_f64();
            if !(0.001..=0.25).contains(&dt) {
                self.buckets.clear();
                self.since = None;
                self.calibration.clear();
                self.calibration_start = None;
            } else {
                let d = s
                    .position
                    .iter()
                    .zip(p.position)
                    .map(|(a, b)| (a - b).powi(2))
                    .sum::<f64>()
                    .sqrt();
                let r = angle(s.quaternion, p.quaternion).unwrap();
                // Calibration records raw per-sample noise at a normalized 20 Hz.
                if config.calibrating && self.report.calibration.is_none() {
                    let start = *self.calibration_start.get_or_insert(now);
                    if d > 0.02 || r > 2.0 || s.activity {
                        self.calibration.clear();
                        self.calibration_start = Some(now);
                    } else if self.calibration.len() < 400 {
                        self.calibration.push([d * 0.05 / dt, r * 0.05 / dt]);
                    }
                    self.report.calibration_progress =
                        (now.saturating_sub(start).as_secs_f64() * 10.0).min(99.0) as u8;
                    if now.saturating_sub(start) >= Duration::from_secs(10)
                        && self.calibration.len() >= 150
                    {
                        let mut noise = [0.0; 2];
                        for axis in 0..2 {
                            let mut values: Vec<f64> =
                                self.calibration.iter().map(|s| s[axis]).collect();
                            values.sort_by(f64::total_cmp);
                            noise[axis] = values[(values.len() * 95 / 100).min(values.len() - 1)];
                        }
                        self.report.calibration = Some([noise[0].min(0.02), noise[1].min(2.0)]);
                        self.report.calibration_progress = 100;
                    }
                }
                if self.buckets.back().is_none_or(|b| b.time != now.as_secs()) {
                    self.buckets.push_back(Bucket {
                        time: now.as_secs(),
                        ..Default::default()
                    });
                }
                let b = self.buckets.back_mut().unwrap();
                b.distance += d;
                b.rotation += r;
                b.corrected_distance += (d - config.noise_position * dt / 0.05).max(0.0);
                b.corrected_rotation += (r - config.noise_rotation * dt / 0.05).max(0.0);
                movement = b.corrected_distance > 0.08 || b.corrected_rotation > 15.0;
            }
        }
        self.previous = Some((now, s));
        while self
            .buckets
            .front()
            .is_some_and(|b| now.as_secs().saturating_sub(b.time) >= 3600)
        {
            self.buckets.pop_front();
        }
        let factor = [0.5, 0.75, 1.0, 1.5, 2.0][config.sensitivity.clamp(1, 5) as usize - 1];
        let seconds = (config.minutes.clamp(5, 60) * 60) as f64;
        self.report.distance_threshold = 0.003 * seconds * factor;
        self.report.rotation_threshold = 0.3 * seconds * factor;
        let sum = |n: u32, corrected: bool| -> (f64, f64) {
            self.buckets
                .iter()
                .filter(|b| now.as_secs().saturating_sub(b.time) < u64::from(n))
                .fold((0.0, 0.0), |a, b| {
                    if corrected {
                        (a.0 + b.corrected_distance, a.1 + b.corrected_rotation)
                    } else {
                        (a.0 + b.distance, a.1 + b.rotation)
                    }
                })
        };
        let short = sum(10, true);
        let long = sum(seconds as u32, true);
        let active = movement
            || (config.controllers && s.activity)
            || short.0 > 0.03 * factor
            || (config.rotation && short.1 > 3.0 * factor);
        if active {
            self.since = Some(now);
        }
        let since = *self.since.get_or_insert(now);
        self.report.elapsed_secs = now.saturating_sub(since).as_secs().min(seconds as u64) as u32;
        self.report.activity = active;
        self.report.candidate = !config.calibrating
            && !active
            && self.report.elapsed_secs >= seconds as u32
            && long.0 <= self.report.distance_threshold
            && (!config.rotation || long.1 <= self.report.rotation_threshold);
        self.report.windows = [10, 60, 300, 600, 900, seconds as u32]
            .into_iter()
            .map(|n| {
                let (distance, rotation) = sum(n, false);
                MotionWindow {
                    seconds: n,
                    distance,
                    rotation,
                }
            })
            .collect();
        self.report.clone()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn still() -> Sample {
        Sample {
            position: [0.; 3],
            quaternion: [1., 0., 0., 0.],
            valid: true,
            activity: false,
            controllers_available: true,
            presence_available: true,
        }
    }
    #[test]
    fn quaternion_sign_normalization_and_invalid() {
        assert_eq!(angle([2., 0., 0., 0.], [-1., 0., 0., 0.]), Some(0.));
        assert!(angle([0.; 4], [1.; 4]).is_none());
    }
    #[test]
    fn full_window_restart_controller_and_bounded_hour() {
        let mut d = Detector::default();
        let c = DetectorConfig {
            enabled: true,
            minutes: 60,
            ..Default::default()
        };
        for i in 0..72000 {
            assert!(
                !d.sample(&c, Duration::from_millis(i * 50), Some(still()))
                    .candidate
            );
        }
        assert!(
            d.sample(&c, Duration::from_secs(3600), Some(still()))
                .candidate
        );
        assert!(d.buckets.len() <= 3600);
        let mut s = still();
        s.activity = true;
        assert!(
            !d.sample(&c, Duration::from_millis(3600050), Some(s))
                .candidate
        );
        assert_eq!(d.report.elapsed_secs, 0);
        d.sample(&c, Duration::from_millis(3600100), None);
        assert!(!d.report.valid);
        assert_eq!(
            d.sample(&c, Duration::from_millis(3600150), Some(still()))
                .elapsed_secs,
            0
        );
    }
    #[test]
    fn rotation_movement_and_noise() {
        let c = DetectorConfig {
            enabled: true,
            minutes: 5,
            ..Default::default()
        };
        let mut d = Detector::default();
        for i in 0..=6000 {
            let mut s = still();
            s.position[0] = if i % 2 == 0 { 0.0001 } else { 0. };
            d.sample(&c, Duration::from_millis(i * 50), Some(s));
        }
        assert!(d.report.candidate);
        let mut s = still();
        s.quaternion = [
            std::f64::consts::FRAC_1_SQRT_2,
            0.,
            std::f64::consts::FRAC_1_SQRT_2,
            0.,
        ];
        assert!(
            !d.sample(&c, Duration::from_millis(300050), Some(s))
                .candidate
        );
        assert_eq!(d.report.elapsed_secs, 0);
    }
    #[test]
    fn calibration_needs_contiguous_valid_data() {
        let c = DetectorConfig {
            calibrating: true,
            ..Default::default()
        };
        let mut d = Detector::default();
        for i in 0..250 {
            d.sample(&c, Duration::from_millis(i * 50), Some(still()));
        }
        assert_eq!(d.report.calibration, Some([0., 0.]));
        assert!(!d.report.candidate);
        let c = DetectorConfig { generation: 1, ..c };
        assert!(
            d.sample(&c, Duration::from_secs(13), Some(still()))
                .calibration
                .is_none()
        );
    }
    #[test]
    fn half_turn_matrix_preserves_axis_sign() {
        let q = quaternion([[0., -1., 0., 0.], [-1., 0., 0., 0.], [0., 0., -1., 0.]]);
        let c = std::f64::consts::FRAC_1_SQRT_2;
        assert!(angle(q, [0., c, -c, 0.]).unwrap() < 0.0001);
    }
    #[test]
    fn normal_motion_and_sampling_gaps_never_count_as_sleep() {
        let c = DetectorConfig {
            enabled: true,
            minutes: 5,
            ..Default::default()
        };
        let mut d = Detector::default();
        for i in 0..=7000 {
            let mut s = still();
            s.position[0] = (i as f64 / 20.0).sin() * 0.1;
            assert!(
                !d.sample(&c, Duration::from_millis(i * 50), Some(s))
                    .candidate
            );
        }
        let r = d.sample(&c, Duration::from_secs(400), Some(still()));
        assert_eq!(r.elapsed_secs, 0);
        assert!(!r.candidate);
    }
}
