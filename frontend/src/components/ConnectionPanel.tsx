import { useState } from 'react'
import { Button } from '@charcoal-ui/react'
import { useAppContext } from '../context/AppContext'
import { HowToSection } from './HowToSection'
import { ErrorCard } from './ErrorCard'
import { SetupChecklist } from './SetupChecklist'

export function ConnectionPanel() {
  const {
    t,
    connectionMode,
    isConnected,
    deviceIp,
    checkDevices,
    setupWireless,
    wirelessSetupStatus,
    wiredSetupStatus,
    connectManual,
    autoConnectStatus,
    connectionError,
    setupSteps,
  } = useAppContext()

  const isSettingUp = wirelessSetupStatus === 'loading'
  const isChecking = wiredSetupStatus === 'loading'
  const isAutoConnected = autoConnectStatus === 'success'

  const [showSetup, setShowSetup] = useState(false)
  const shouldShowSetup = !isConnected || showSetup || isSettingUp || isChecking

  const handleCheckDevices = async () => {
    const success = await checkDevices()
    if (success) setShowSetup(false)
  }

  const handleSetupWireless = async () => {
    const success = await setupWireless()
    if (success) setShowSetup(false)
  }

  const handleConnectManual = async () => {
    const success = await connectManual()
    if (success) setShowSetup(false)
  }

  const connectedMessage = (() => {
    if (connectionMode === 'wired') {
      return t('wired_connected')
    }
    if (!isAutoConnected && wirelessSetupStatus === 'success') {
      return t('wireless_status_success')
    }
    return t('wireless_connected', { ip: deviceIp })
  })()

  return (
    <div className='flex flex-col gap-4'>
      {/* Connection status */}
      <div className='bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700'>
        {/* Header: mode + IP */}
        <div className='flex justify-between items-center mb-4'>
          <div className='flex items-center gap-2'>
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
            <span className='font-semibold text-sm text-gray-800 dark:text-gray-200'>
              {connectionMode === 'wired' ? t('mode_wired') : t('mode_wireless')}
            </span>
          </div>
          {deviceIp && (
            <span className='font-mono text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700'>
              {deviceIp}
            </span>
          )}
        </div>

        {/* Connected status banner */}
        {isConnected && !shouldShowSetup && (
          <div className='flex flex-col gap-3'>
            <div className='flex items-center gap-2.5 rounded-lg px-4 py-3 text-sm font-medium bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 animate-fadeIn'>
              <svg className='w-4 h-4 shrink-0' viewBox='0 0 20 20' fill='currentColor'>
                <path
                  fillRule='evenodd'
                  d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                  clipRule='evenodd'
                />
              </svg>
              <span>{connectedMessage}</span>
            </div>

            <button
              onClick={() => setShowSetup(true)}
              className='text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1'
            >
              {t('btn_reconnect')}
            </button>
          </div>
        )}

        {/* Setup buttons */}
        {shouldShowSetup && (
          <div className='flex flex-col gap-3'>
            {connectionMode === 'wired' ? (
              <>
                <Button onClick={handleCheckDevices} fullWidth disabled={isChecking}>
                  {isChecking ? t('wired_status_loading') : t('btn_check_devices')}
                </Button>

                {wiredSetupStatus === 'error' && (
                  <ErrorCard error={connectionError} fallbackMessage={t('wired_status_error')} />
                )}
                {wiredSetupStatus === 'success' && (
                  <div className='flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 animate-fadeIn'>
                    <span>{t('wired_status_success')}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <Button
                  onClick={handleSetupWireless}
                  variant='Navigation'
                  fullWidth
                  disabled={isSettingUp}
                >
                  {isSettingUp ? t('wireless_status_loading') : t('btn_setup_wireless')}
                </Button>

                {/* Show Checklist during or after wireless setup */}
                {(isSettingUp || wirelessSetupStatus === 'error') && (
                  <SetupChecklist steps={setupSteps} />
                )}

                {wirelessSetupStatus === 'error' && (
                  <ErrorCard error={connectionError} fallbackMessage={t('wireless_status_error')} />
                )}

                {wirelessSetupStatus === 'success' && (
                  <div className='flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 animate-fadeIn'>
                    <span>{t('wireless_status_success')}</span>
                  </div>
                )}

                <Button onClick={handleConnectManual} fullWidth>
                  {t('btn_connect_manual')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <HowToSection />
    </div>
  )
}
