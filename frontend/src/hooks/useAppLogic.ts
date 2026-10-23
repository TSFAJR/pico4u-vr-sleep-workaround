import { useAppDialog } from './useAppDialog'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { useSettings } from './useSettings'
import { useConnection } from './useConnection'
import { useRuntime } from './useRuntime'
import { useTheme } from './useTheme'
import { useSleep } from './useSleep'
import { useSteamVr } from './useSteamVr'
import { formatErrorLog, toAppError, type AppError } from '../lib/errors'
import { normalizeLanguage } from '../lib/language'
import {
  INITIAL_SETUP_STEPS,
  updateSetupSteps,
  type SetupProgressPayload,
  type SetupStepItem,
} from '../lib/setupSteps'
import type { ConnectionMode } from '../types'
export type { ConnectionStatus } from '../types'

export function useAppLogic() {
  const { t, i18n } = useTranslation()
  const dialog = useAppDialog()
  const settings = useSettings()
  const sleep = useSleep()
  const steamvr = useSteamVr(settings, sleep.status?.sleeping ?? false)
  const runtime = useRuntime()
  const connection = useConnection(
    runtime.ready ? settings.config : null,
    settings.update,
    runtime.running || runtime.busy,
  )
  const { theme, setTheme } = useTheme()
  const config = settings.config
  const mode = config?.last_connection_mode ?? null
  const status = connection.result.kind === 'success' ? connection.result.status : null
  const connectionError: AppError | null =
    connection.error ?? (connection.result.kind === 'error' ? connection.result.error : null)

  const [wirelessSetupStatus, setWirelessSetupStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [setupSteps, setSetupSteps] = useState<SetupStepItem[]>(INITIAL_SETUP_STEPS)

  useEffect(() => {
    const unlisten = listen<SetupProgressPayload>('setup-progress', (event) => {
      setSetupSteps((prev) => updateSetupSteps(prev, event.payload))
      if (event.payload.state === 'failed') {
        const detailStr = event.payload.detail ? ` (${event.payload.detail})` : ''
        runtime.addLog(
          `${t('log_setup_step_failed', { step: t(`setup_step_${event.payload.step}`) })}${detailStr}`,
        )
      }
    }).catch(() => () => {})

    return () => {
      void unlisten.then((stop) => stop())
    }
  }, [t, runtime.addLog])

  useEffect(() => {
    if (connectionError) {
      runtime.addLog(formatErrorLog(connectionError, t, runtime.debug))
    }
  }, [connectionError, runtime.addLog, runtime.debug, t])

  useEffect(() => {
    if (runtime.error) {
      const appErr = toAppError(runtime.error)
      runtime.addLog(formatErrorLog(appErr, t, runtime.debug))
    }
  }, [runtime.error, runtime.addLog, runtime.debug, t])

  const resetSetup = useCallback(() => {
    setSetupSteps(INITIAL_SETUP_STEPS)
    setWirelessSetupStatus('idle')
    connection.clearError()
  }, [connection.clearError])

  const setupWireless = async () => {
    setSetupSteps(INITIAL_SETUP_STEPS)
    setWirelessSetupStatus('loading')
    runtime.addLog(t('log_wireless_init'))
    const connected = await connection.setup()
    setWirelessSetupStatus(connected ? 'success' : 'error')
    if (connected) {
      runtime.addLog(t('log_wireless_complete'))
    }
    return connected
  }

  const checkDevices = async () => {
    setSetupSteps(INITIAL_SETUP_STEPS)
    runtime.addLog(t('log_checking_devices'))
    const connected = await connection.connect('wired')
    if (connected) {
      runtime.addLog(t('wired_status_success'))
    }
    return connected
  }

  const connectManual = async (ip?: string) => {
    const address =
      ip ??
      (await dialog.ask({
        kind: 'input',
        title: t('btn_connect_manual'),
        message: t('prompt_enter_ip'),
        confirmText: t('btn_connect_manual'),
        defaultValue: config?.ip_address ?? '',
      }))
    if (!address) return false
    runtime.addLog(t('log_connecting_manual', { ip: address }))
    const connected = await connection.connect('wireless', address)
    if (connected) {
      runtime.addLog(t('log_auto_connect_success', { ip: address }))
    }
    return connected
  }

  const toggleKeepAwake = async () => {
    if (
      runtime.running &&
      (sleep.status?.monitoring || sleep.status?.sleeping) &&
      !(await dialog.ask({
        kind: 'confirm',
        title: t('ui_stop'),
        message: t('sleep_stop_warning'),
        confirmText: t('ui_stop'),
      }))
    )
      return
    const wasRunning = runtime.running
    const interval = config?.keep_awake_interval_secs ?? 3
    await runtime.toggle(mode, connection.connected, connection.busy || settings.isSaving)
    if (!runtime.error) {
      runtime.addLog(wasRunning ? t('log_stopped_loop') : t('log_started_loop', { interval }))
    }
  }

  const toggleDebugMode = async (enabled: boolean) => {
    await runtime.toggleDebug(enabled)
    runtime.addLog(t(enabled ? 'log_debug_enabled' : 'log_debug_disabled'))
  }

  const getDeviceModel = useCallback(
    async () => (status?.is_usb_connected ? 'A9210' : null),
    [status?.is_usb_connected],
  )

  return {
    dialog,
    t,
    i18n,
    theme,
    setTheme,
    settings,
    steamvr,
    sleep,
    runtime,
    connection,
    setupSteps,
    resetSetup,
    logs: runtime.logs,
    isRunning: runtime.running,
    isDebug: runtime.debug,
    isConnecting: connection.busy,
    runtimeError: runtime.error ? toAppError(runtime.error) : null,
    deviceIp: config?.ip_address ?? '',
    connectionMode: mode,
    isConnected: connection.connected,
    connectionStatus: status,
    connectionError,
    keepAwakeInterval: config?.keep_awake_interval_secs ?? 3,
    changeLanguage: (language: string) => {
      void i18n.changeLanguage(normalizeLanguage(language))
    },
    toggleDebugMode,
    handleModeSelect: (next: ConnectionMode) => connection.selectMode(next),
    setConnectionMode: connection.selectMode,
    checkDevices,
    setupWireless,
    connectManual,
    toggleKeepAwake,
    updateKeepAwakeInterval: (seconds: number) =>
      settings.update({ keep_awake_interval_secs: seconds }),
    autoConnectStatus: connection.autoStatus,
    autoConnectType: mode,
    autoConnectAttempt: connection.attempt,
    retryAutoConnect: () => connection.connect(mode ?? 'wired', config?.ip_address ?? '', true),
    setAutoConnectStatus: (_value: string) => connection.dismiss(),
    getDeviceModel,
    wirelessSetupStatus,
    wiredSetupStatus: (connection.busy
      ? 'loading'
      : connectionError
        ? 'error'
        : status?.is_usb_connected
          ? 'success'
          : 'idle') as 'loading' | 'error' | 'idle' | 'success',
  }
}
