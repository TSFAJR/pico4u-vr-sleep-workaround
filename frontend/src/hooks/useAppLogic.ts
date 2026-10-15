import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { useSettings } from './useSettings'
import { useConnection } from './useConnection'
import { useRuntime } from './useRuntime'
import { useTheme } from './useTheme'
import { formatErrorLog, toAppError, type AppError } from '../lib/errors'
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
  const settings = useSettings()
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
        runtime.addLog(`${t(`setup_step_${event.payload.step}`)}: failed${detailStr}`)
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

  const setupWireless = async () => {
    setSetupSteps(INITIAL_SETUP_STEPS)
    setWirelessSetupStatus('loading')
    const connected = await connection.setup()
    setWirelessSetupStatus(connected ? 'success' : 'error')
    return connected
  }

  const getDeviceModel = useCallback(
    async () => (status?.is_usb_connected ? 'A9210' : null),
    [status?.is_usb_connected],
  )

  return {
    t,
    i18n,
    theme,
    setTheme,
    settings,
    runtime,
    connection,
    setupSteps,
    logs: runtime.logs,
    isRunning: runtime.running,
    isDebug: runtime.debug,
    deviceIp: config?.ip_address ?? '',
    connectionMode: mode,
    isConnected: connection.connected,
    connectionStatus: status,
    connectionError,
    dimAfterHours: config?.dim_delay_hours ?? 1,
    keepAwakeInterval: config?.keep_awake_interval_secs ?? 3,
    changeLanguage: (language: string) => {
      void i18n.changeLanguage(language)
    },
    toggleDebugMode: runtime.toggleDebug,
    handleModeSelect: (next: ConnectionMode) => connection.selectMode(next),
    setConnectionMode: connection.selectMode,
    checkDevices: () => connection.connect('wired'),
    setupWireless,
    connectManual: async (ip?: string) => {
      const address = ip ?? window.prompt(t('prompt_enter_ip'), config?.ip_address ?? '')
      return address ? connection.connect('wireless', address) : false
    },
    toggleKeepAwake: () =>
      runtime.toggle(mode, connection.connected, connection.busy || settings.isSaving),
    updateDimDelay: (hours: number) => settings.update({ dim_delay_hours: hours }),
    updateKeepAwakeInterval: (seconds: number) =>
      settings.update({ keep_awake_interval_secs: seconds }),
    autoConnectStatus: connection.autoStatus,
    autoConnectType: mode,
    autoConnectAttempt: connection.attempt,
    retryAutoConnect: () => connection.connect(),
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
