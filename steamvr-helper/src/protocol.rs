use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Failure {
    pub code: String,
    pub detail: String,
}

impl Failure {
    pub fn new(code: &str, detail: impl ToString) -> Self {
        Self {
            code: code.into(),
            detail: detail.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Desired {
    pub revision: u64,
    pub enabled: bool,
    pub percent: u8,
    pub retry: u64,
    pub quit: bool,
    pub detector: DetectorConfig,
    pub fade_ms: u32,
}

impl Default for Desired {
    fn default() -> Self {
        Self {
            revision: 0,
            enabled: false,
            percent: 100,
            retry: 0,
            quit: false,
            detector: DetectorConfig::default(),
            fade_ms: 0,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Report {
    pub detection: DetectionReport,
    pub revision: u64,
    pub phase: String,
    pub applied_percent: Option<u8>,
    pub error: Option<Failure>,
}

impl Default for Report {
    fn default() -> Self {
        Self {
            revision: 0,
            phase: "disabled".into(),
            detection: DetectionReport::default(),
            applied_percent: Some(100),
            error: None,
        }
    }
}

pub fn alpha(percent: u8) -> f32 {
    1.0 - (f32::from(percent.min(100)) / 100.0).powf(1.0 / 0.55)
}

// Rays are in eye coordinates, with forward along -Z. Intersect each eye's
// four frustum corners with the HMD-relative overlay plane, not the world plane.
pub fn covering_width(eyes: &[([f32; 4], [[f32; 4]; 3]); 2]) -> Result<f32, String> {
    let mut extent = 0.0f32;
    for (bounds, matrix) in eyes {
        for x in [bounds[0], bounds[1]] {
            for y in [bounds[2], bounds[3]] {
                let ray = [x, y, -1.0];
                let d: [f32; 3] =
                    std::array::from_fn(|r| (0..3).map(|c| matrix[r][c] * ray[c]).sum());
                let t = (-0.15 - matrix[2][3]) / d[2];
                if !t.is_finite() || t <= 0.0 {
                    return Err("Invalid eye projection".into());
                }
                for r in 0..2 {
                    let value = matrix[r][3] + t * d[r];
                    if !value.is_finite() {
                        return Err("Non-finite eye projection".into());
                    }
                    extent = extent.max(value.abs());
                }
            }
        }
    }
    let width = (2.0 * extent * 1.1).max(1.0);
    if width > 20.0 {
        return Err("Eye projection exceeds supported overlay size".into());
    }
    Ok(width)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn curve_is_monotonic_with_exact_endpoints() {
        assert_eq!(alpha(0), 1.0);
        assert_eq!(alpha(100), 0.0);
        for i in 0..100 {
            assert!(alpha(i) >= alpha(i + 1));
        }
    }
    #[test]
    fn square_covers_both_offset_eyes_and_extreme_fov() {
        let eye = |x| [[1., 0., 0., x], [0., 1., 0., 0.], [0., 0., 1., 0.]];
        assert_eq!(
            covering_width(&[
                ([-1., 1., -1., 1.], eye(-0.04)),
                ([-1., 1., -1., 1.], eye(0.04))
            ])
            .unwrap(),
            1.0
        );
        let eyes = [
            ([-4., 4., -2., 2.], eye(-0.04)),
            ([-4., 4., -2., 2.], eye(0.04)),
        ];
        assert!(covering_width(&eyes).unwrap() >= 1.4);
        let invalid = [([f32::NAN; 4], eye(0.0)); 2];
        assert!(covering_width(&invalid).is_err());
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct DetectorConfig {
    pub enabled: bool,
    pub generation: u64,
    pub minutes: u32,
    pub sensitivity: u8,
    pub rotation: bool,
    pub controllers: bool,
    pub calibrating: bool,
    pub noise_position: f64,
    pub noise_rotation: f64,
}
impl Default for DetectorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            generation: 0,
            minutes: 15,
            sensitivity: 3,
            rotation: true,
            controllers: true,
            calibrating: false,
            noise_position: 0.0005,
            noise_rotation: 0.05,
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct MotionWindow {
    pub seconds: u32,
    pub distance: f64,
    pub rotation: f64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct DetectionReport {
    pub generation: u64,
    pub valid: bool,
    pub elapsed_secs: u32,
    pub candidate: bool,
    pub activity: bool,
    pub controllers_available: bool,
    pub presence_available: bool,
    pub windows: Vec<MotionWindow>,
    pub distance_threshold: f64,
    pub rotation_threshold: f64,
    pub calibration_progress: u8,
    pub calibration: Option<[f64; 2]>,
    pub error: Option<Failure>,
}
