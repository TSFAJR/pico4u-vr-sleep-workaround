use crate::connection::ConnectionMode;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct AppConfig {
    pub ip_address: String,
    pub keep_awake_interval_secs: u64,
    pub last_connection_mode: Option<ConnectionMode>,
    pub steamvr_brightness_percent: u8,
    pub sleep: SleepConfig,
}

impl AppConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.steamvr_brightness_percent > 100
            || !(1..=3600).contains(&self.keep_awake_interval_secs)
            || self.sleep.validate().is_err()
        {
            return Err("invalid_settings".into());
        }
        if !self.ip_address.is_empty() {
            crate::connection::endpoint(&self.ip_address)?;
        }
        Ok(())
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ip_address: String::new(),
            keep_awake_interval_secs: 3,
            last_connection_mode: None,
            steamvr_brightness_percent: 100,
            sleep: SleepConfig::default(),
        }
    }
}

fn get_config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("pico4u_config.json"))
}

pub fn load_config(app: &AppHandle) -> AppConfig {
    if let Some(path) = get_config_path(app)
        && let Ok(content) = fs::read_to_string(path)
        && let Ok(config) = serde_json::from_str(&content)
    {
        return config;
    }
    AppConfig::default()
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    if let Some(path) = get_config_path(app) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, content).map_err(|e| e.to_string())?;
        fs::rename(temporary, path).map_err(|e| e.to_string())
    } else {
        Err("Failed to resolve config directory".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_settings_load_with_defaults() {
        let config: AppConfig =
            serde_json::from_str(r#"{"ip_address":"192.168.1.2","last_connection_mode":"wired"}"#)
                .unwrap();
        assert_eq!(config.keep_awake_interval_secs, 3);
        assert_eq!(config.steamvr_brightness_percent, 100);
        assert!(!config.sleep.enabled);
        assert_eq!(config.sleep.software_percent, 5);
        assert_eq!(config.last_connection_mode, Some(ConnectionMode::Wired));
        assert!(config.validate().is_ok());
    }
    #[test]
    fn rejects_invalid_timer_values() {
        let config = AppConfig {
            steamvr_brightness_percent: 101,
            ..AppConfig::default()
        };
        assert!(config.validate().is_err());
        let config = AppConfig {
            keep_awake_interval_secs: 0,
            ..AppConfig::default()
        };
        assert!(config.validate().is_err());
        let config = AppConfig {
            sleep: SleepConfig {
                physical: f64::NAN,
                ..SleepConfig::default()
            },
            ..AppConfig::default()
        };
        assert!(config.validate().is_err());
    }
    #[test]
    fn timer_migration_preserves_connection_and_never_arms_detection() {
        let c:AppConfig=serde_json::from_str(r#"{"dim_delay_hours":1,"auto_dim_steamvr":true,"auto_dim_steamvr_percent":0,"ip_address":"192.168.1.20","last_connection_mode":"wireless","steamvr_brightness_percent":35}"#).unwrap();
        assert!(!c.sleep.enabled);
        assert_eq!(c.sleep.software_percent, 5);
        assert_eq!(c.steamvr_brightness_percent, 35);
        assert_eq!(c.ip_address, "192.168.1.20");
        assert!(
            !serde_json::to_string(&c)
                .unwrap()
                .contains("dim_delay_hours")
        );
    }
    #[test]
    fn rejects_invalid_sleep_ranges_and_nonfinite_noise() {
        for c in [
            SleepConfig {
                minutes: 4,
                ..Default::default()
            },
            SleepConfig {
                physical: 1.1,
                ..Default::default()
            },
            SleepConfig {
                noise_rotation: f64::INFINITY,
                ..Default::default()
            },
            SleepConfig {
                software_percent: 101,
                ..Default::default()
            },
        ] {
            assert!(c.validate().is_err());
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct SleepConfig {
    pub enabled: bool,
    pub minutes: u32,
    pub sensitivity: u8,
    pub controllers: bool,
    pub rotation: bool,
    pub confirmation: bool,
    pub cooldown_minutes: u32,
    pub physical: f64,
    pub restore_physical: f64,
    pub software_percent: u8,
    pub enter_seconds: u32,
    pub exit_seconds: u32,
    pub noise_position: f64,
    pub noise_rotation: f64,
}
impl Default for SleepConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            minutes: 15,
            sensitivity: 3,
            controllers: true,
            rotation: true,
            confirmation: true,
            cooldown_minutes: 15,
            physical: 0.0,
            restore_physical: 0.5,
            software_percent: 5,
            enter_seconds: 3,
            exit_seconds: 1,
            noise_position: 0.0005,
            noise_rotation: 0.05,
        }
    }
}
impl SleepConfig {
    pub fn validate(&self) -> Result<(), String> {
        if !(5..=60).contains(&self.minutes)
            || !(1..=5).contains(&self.sensitivity)
            || self.cooldown_minutes > 120
            || self.software_percent > 100
            || self.enter_seconds > 30
            || self.exit_seconds > 30
            || !self.physical.is_finite()
            || !(0.0..=1.0).contains(&self.physical)
            || !self.restore_physical.is_finite()
            || !(0.0..=1.0).contains(&self.restore_physical)
            || !self.noise_position.is_finite()
            || !(0.0..=0.02).contains(&self.noise_position)
            || !self.noise_rotation.is_finite()
            || !(0.0..=2.0).contains(&self.noise_rotation)
        {
            Err("invalid_sleep_settings".into())
        } else {
            Ok(())
        }
    }
}
