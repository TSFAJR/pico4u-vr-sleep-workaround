export type ErrorCode =
  | 'adb_unavailable'
  | 'timeout'
  | 'already_running'
  | 'invalid_ip'
  | 'multiple_pico'
  | 'usb_not_found'
  | 'usb_unauthorized'
  | 'usb_offline'
  | 'not_pico'
  | 'wifi_disabled'
  | 'wifi_not_connected'
  | 'tcpip_failed'
  | 'wireless_refused'
  | 'wireless_unreachable'
  | 'wireless_unauthorized'
  | 'wireless_not_found'
  | 'device_lost'
  | 'unknown'

export interface AppError {
  code: ErrorCode
  detail?: string | null
}

export function toAppError(e: unknown): AppError {
  if (!e) {
    return { code: 'unknown', detail: null }
  }
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const candidate = e as { code: unknown; detail?: unknown }
    if (typeof candidate.code === 'string') {
      return {
        code: candidate.code as ErrorCode,
        detail: typeof candidate.detail === 'string' ? candidate.detail : null,
      }
    }
  }

  const str = e instanceof Error ? e.message : String(e)
  if (str === 'connection_timeout' || str.includes('timed out')) {
    return { code: 'timeout', detail: str }
  }
  if (str === 'pico_not_connected') {
    return { code: 'usb_not_found', detail: str }
  }
  if (str === 'already_running') {
    return { code: 'already_running', detail: str }
  }
  if (str === 'invalid_ip') {
    return { code: 'invalid_ip', detail: str }
  }
  if (str.includes('unauthorized')) {
    return { code: 'usb_unauthorized', detail: str }
  }
  if (str.includes('offline')) {
    return { code: 'usb_offline', detail: str }
  }
  if (str.includes('Failed to start ADB server') || str.includes('ADB server unavailable')) {
    return { code: 'adb_unavailable', detail: str }
  }
  return { code: 'unknown', detail: str }
}

export function formatErrorLog(
  err: AppError,
  t: (key: string, options?: Record<string, unknown>) => string,
  withDetail = false,
): string {
  const titleKey = `errors.${err.code}.title`
  const translated = t(titleKey)
  const title = translated !== titleKey ? translated : err.code
  if (withDetail && err.detail) {
    return `${title} (${err.detail})`
  }
  return title
}
