import type { AppError } from './lib/errors'

export type ConnectionMode = 'wired' | 'wireless'

export interface AppConfig {
  ip_address: string
  keep_awake_interval_secs: number
  last_connection_mode: ConnectionMode | null
  steamvr_brightness_percent: number
  sleep: SleepConfig
}

export interface ConnectionStatus {
  phase?: 'checking' | 'connected' | 'reconnecting' | 'disconnected'
  attempt?: number
  error?: AppError | null
  is_usb_connected: boolean
  is_wifi_ip_available: boolean
  wifi_ip: string | null
  is_adb_tcp_connected: boolean
}

export interface SetupOutcome {
  ip: string
  already_connected: boolean
}

export type ConnectionResult =
  | { kind: 'loading' }
  | { kind: 'success'; status: ConnectionStatus }
  | { kind: 'error'; error: AppError }

export function isConnected(result: ConnectionResult, mode: ConnectionMode | null) {
  return (
    result.kind === 'success' &&
    (mode === 'wired'
      ? result.status.is_usb_connected
      : mode === 'wireless' && result.status.is_adb_tcp_connected)
  )
}

export interface SleepConfig {
  enabled: boolean
  minutes: number
  sensitivity: number
  controllers: boolean
  rotation: boolean
  confirmation: boolean
  cooldown_minutes: number
  physical: number
  restore_physical: number
  software_percent: number
  enter_seconds: number
  exit_seconds: number
  noise_position: number
  noise_rotation: number
}
export const defaultSleepConfig: SleepConfig = {
  enabled: false,
  minutes: 15,
  sensitivity: 3,
  controllers: true,
  rotation: true,
  confirmation: true,
  cooldown_minutes: 15,
  physical: 0,
  restore_physical: 0.5,
  software_percent: 5,
  enter_seconds: 3,
  exit_seconds: 1,
  noise_position: 0.0005,
  noise_rotation: 0.05,
}
export interface SleepStatus {
  revision: number
  phase: string
  monitoring: boolean
  sleeping: boolean
  busy: boolean
  keep_awake: boolean
  physical_applied: boolean
  software_applied: boolean
  recovery_pending: boolean
  fallback_restore: boolean
  cooldown_secs: number
  pending_secs: number
  changed_at: string
  reason: string
  error: { code: string; detail: string } | null
  detection: {
    generation: number
    valid: boolean
    elapsed_secs: number
    candidate: boolean
    activity: boolean
    controllers_available: boolean
    presence_available: boolean
    calibration_progress: number
    calibration: [number, number] | null
    distance_threshold: number
    rotation_threshold: number
    windows: { seconds: number; distance: number; rotation: number }[]
    error: { code: string; detail: string } | null
  }
}
