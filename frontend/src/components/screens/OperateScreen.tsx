import { useState, useEffect } from 'react'
import { useAppContext } from '../../context/AppContext'
import { ConnectionChip } from '../ui/ConnectionChip'
import { PowerButton } from '../ui/PowerButton'
import { ErrorCard } from '../ErrorCard'

interface OperateScreenProps {
  onChangeConnection: () => void
  onOpenLogs: () => void
}

export function OperateScreen({ onChangeConnection, onOpenLogs }: OperateScreenProps) {
  const {
    t,
    connectionMode,
    deviceIp,
    isConnected,
    isRunning,
    isDebug,
    toggleKeepAwake,
    keepAwakeInterval,
    dimAfterHours,
    wirelessSetupStatus,
    setupSteps,
    runtimeError,
  } = useAppContext()

  // Elapsed time tracker while running
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!isRunning) {
      setElapsedSeconds(0)
      return
    }

    const start = Date.now()
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning])

  const formatElapsed = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const showWirelessSetupHint =
    !isRunning && isConnected && connectionMode === 'wireless' && wirelessSetupStatus === 'success'
  const isAlreadyWireless = setupSteps[0]?.detail === 'already_connected'

  return (
    <div className='flex-1 flex flex-col justify-between items-center px-5 py-4 animate-fadeIn select-none'>
      {/* Top Connection Chip */}
      <div className='flex flex-col items-center gap-2'>
        <ConnectionChip mode={connectionMode} ip={deviceIp} connected={isConnected} />
        <p
          className={`text-[11px] leading-4 text-brand font-medium text-center ${
            showWirelessSetupHint ? 'visible' : 'invisible'
          }`}
        >
          {isAlreadyWireless ? t('setup_already_wireless') : t('wireless_status_success')}
        </p>
      </div>

      {/* Center Action Area */}
      <div className='flex flex-col items-center justify-center my-auto w-full'>
        <PowerButton
          isRunning={isRunning}
          onClick={toggleKeepAwake}
          disabled={!isConnected && !isRunning}
        />

        {/* Status text (fixed two-line height to prevent PowerButton shift) */}
        <div className='mt-3 text-center'>
          <p className='text-xs leading-4 font-semibold text-[var(--app-text)]'>
            {isRunning
              ? t('operate_running_desc', { interval: keepAwakeInterval })
              : t('status_stopped')}
          </p>

          <p
            className={`mt-1 text-[11px] leading-4 text-[var(--app-text-muted)] ${
              isRunning ? 'visible' : 'invisible'
            }`}
          >
            {t('operate_elapsed', { time: formatElapsed(elapsedSeconds) })}
            {dimAfterHours > 0 && ` · ${t('operate_dim_after', { hours: dimAfterHours })}`}
          </p>
        </div>

        {runtimeError && !isRunning && (
          <div className='mt-3 w-full'>
            <ErrorCard error={runtimeError} />
          </div>
        )}
      </div>

      {/* Bottom links */}
      <div className='w-full flex justify-between items-center px-4 pb-4 pt-2 border-t border-[var(--app-border)] text-xs text-[var(--app-text-muted)]'>
        <button
          type='button'
          onClick={onChangeConnection}
          disabled={isRunning}
          className='hover:text-[var(--app-text)] transition-colors cursor-pointer py-1 disabled:opacity-40 disabled:cursor-not-allowed'
        >
          {t('btn_change_connection')}
        </button>

        {isDebug && (
          <button
            type='button'
            onClick={onOpenLogs}
            className='hover:text-[var(--app-text)] transition-colors cursor-pointer py-1'
          >
            {t('tab_logs')}
          </button>
        )}
      </div>
    </div>
  )
}
