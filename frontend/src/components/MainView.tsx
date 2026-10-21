import { useState, useEffect } from 'react'
import { Button } from '@charcoal-ui/react'
import { useAppContext } from '../context/AppContext'
import { AppHeader } from './ui/AppHeader'
import { Sheet } from './ui/Sheet'
import { ModeSelectScreen } from './screens/ModeSelectScreen'
import { PrepareScreen } from './screens/PrepareScreen'
import { OperateScreen } from './screens/OperateScreen'
import { ErrorCard } from './ErrorCard'
import { Settings } from './Settings'
import { Logs } from './Logs'
import { SteamVrBrightness } from './SteamVrBrightness'
import type { ConnectionMode } from '../types'

type Screen = 'mode' | 'prepare' | 'operate'
type SheetType = 'settings' | 'logs' | null

function HomeBrightness() {
  return (
    <div className='shrink-0 mx-5 mb-4 p-4 max-h-[45vh] overflow-y-auto rounded-2xl bg-[var(--app-card)] border border-[var(--app-border)]'>
      <SteamVrBrightness />
    </div>
  )
}

export function MainView() {
  const {
    t,
    connectionMode,
    isRunning,
    autoConnectStatus,
    setAutoConnectStatus,
    retryAutoConnect,
    autoConnectType,
    autoConnectAttempt,
    deviceIp,
    connectionError,
    resetSetup,
  } = useAppContext()

  const [screen, setScreen] = useState<Screen>(connectionMode ? 'operate' : 'mode')
  const [targetMode, setTargetMode] = useState<ConnectionMode>(connectionMode ?? 'wireless')
  const [activeSheet, setActiveSheet] = useState<SheetType>(null)

  useEffect(() => {
    if ((autoConnectStatus === 'success' || isRunning) && connectionMode) {
      setTargetMode(connectionMode)
      setScreen('operate')
    }
  }, [autoConnectStatus, isRunning, connectionMode])

  // ─── Auto-connecting / Failed State ───
  if (
    autoConnectStatus === 'idle' ||
    autoConnectStatus === 'connecting' ||
    autoConnectStatus === 'failed'
  ) {
    return (
      <div className='relative flex flex-col h-screen bg-[var(--app-bg)] text-[var(--app-text)]'>
        <AppHeader onOpenSettings={() => setActiveSheet('settings')} />

        <div className='flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-5 py-4'>
          <div className='shrink-0 my-auto bg-[var(--app-card)] rounded-2xl p-6 shadow-sm border border-[var(--app-border)] w-full max-w-sm text-center'>
            {(autoConnectStatus === 'idle' || autoConnectStatus === 'connecting') && (
              <div className='flex flex-col items-center gap-4 py-4'>
                <span className='w-8 h-8 border-3 border-gray-200 dark:border-gray-700 border-t-brand rounded-full animate-spin' />
                <div>
                  <p className='text-sm font-semibold text-[var(--app-text)]'>
                    {autoConnectStatus === 'idle' || !autoConnectType
                      ? t('status_checking')
                      : autoConnectType === 'wired'
                        ? t('auto_connect_wired', { attempt: Math.max(1, autoConnectAttempt) })
                        : t('auto_connect_wireless', {
                            ip: deviceIp,
                            attempt: Math.max(1, autoConnectAttempt),
                          })}
                  </p>
                  {deviceIp && autoConnectType === 'wireless' && (
                    <p className='mt-1 text-xs font-mono text-[var(--app-text-muted)]'>
                      {deviceIp}
                    </p>
                  )}
                </div>
              </div>
            )}

            {autoConnectStatus === 'failed' && (
              <div className='flex flex-col items-center gap-4 animate-fadeIn'>
                <div className='w-full'>
                  <ErrorCard
                    error={connectionError}
                    fallbackMessage={t('auto_connect_failed_desc', { ip: deviceIp })}
                  />
                </div>

                <div className='flex flex-col gap-2 w-full mt-1'>
                  <Button onClick={retryAutoConnect} variant='Default' fullWidth>
                    {t('btn_try_again')}
                  </Button>
                  <Button
                    onClick={() => {
                      resetSetup()
                      setAutoConnectStatus('skipped')
                      setTargetMode('wireless')
                      setScreen('prepare')
                    }}
                    variant='Navigation'
                    fullWidth
                  >
                    {t('btn_wireless_setup')}
                  </Button>
                  <button
                    type='button'
                    onClick={() => {
                      resetSetup()
                      setAutoConnectStatus('skipped')
                      setScreen('mode')
                    }}
                    className='text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors py-1 cursor-pointer'
                  >
                    {t('btn_manual_setup')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <HomeBrightness />

        <Sheet
          title={t('settings_title')}
          isOpen={activeSheet === 'settings'}
          onClose={() => setActiveSheet(null)}
        >
          <Settings onClose={() => setActiveSheet(null)} />
        </Sheet>
      </div>
    )
  }

  // ─── Main Wizard Flow ───
  return (
    <div className='relative flex flex-col h-screen bg-[var(--app-bg)] text-[var(--app-text)]'>
      <AppHeader onOpenSettings={() => setActiveSheet('settings')} />

      <main className='flex-1 min-h-0 overflow-y-auto flex flex-col'>
        {screen === 'mode' && (
          <ModeSelectScreen
            onNext={(mode) => {
              resetSetup()
              setTargetMode(mode)
              setScreen('prepare')
            }}
            onBack={() => setScreen('operate')}
          />
        )}

        {screen === 'prepare' && (
          <PrepareScreen
            mode={targetMode}
            onBack={() => {
              resetSetup()
              setScreen('mode')
            }}
            onSuccess={() => setScreen('operate')}
          />
        )}

        {screen === 'operate' && (
          <OperateScreen
            onChangeConnection={() => {
              if (!isRunning) {
                resetSetup()
                setScreen('mode')
              }
            }}
            onOpenLogs={() => setActiveSheet('logs')}
          />
        )}
      </main>
      <HomeBrightness />

      {/* Settings Sheet */}
      <Sheet
        title={t('settings_title')}
        isOpen={activeSheet === 'settings'}
        onClose={() => setActiveSheet(null)}
      >
        <Settings onClose={() => setActiveSheet(null)} />
      </Sheet>

      {/* Logs Sheet */}
      <Sheet
        title={t('tab_logs')}
        isOpen={activeSheet === 'logs'}
        onClose={() => setActiveSheet(null)}
      >
        <Logs />
      </Sheet>
    </div>
  )
}
