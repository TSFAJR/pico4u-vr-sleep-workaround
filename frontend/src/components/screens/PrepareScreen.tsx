import { useEffect, useRef } from 'react'
import { Button } from '@charcoal-ui/react'
import { useAppContext } from '../../context/AppContext'
import { StepIndicator } from '../ui/StepIndicator'
import { SetupChecklist } from '../SetupChecklist'
import { ErrorCard } from '../ErrorCard'
import type { ConnectionMode } from '../../types'

interface PrepareScreenProps {
  mode: ConnectionMode
  onBack: () => void
  onSuccess: () => void
}

export function PrepareScreen({ mode, onBack, onSuccess }: PrepareScreenProps) {
  const {
    t,
    setupWireless,
    checkDevices,
    wirelessSetupStatus,
    wiredSetupStatus,
    isConnecting,
    setupSteps,
    connectionError,
    connectionStatus,
    connectManual,
  } = useAppContext()

  const isWireless = mode === 'wireless'
  const isUsbDetected = Boolean(connectionStatus?.is_usb_connected)
  const isBusy =
    isConnecting ||
    (isWireless ? wirelessSetupStatus === 'loading' : wiredSetupStatus === 'loading')
  const isError =
    Boolean(connectionError) ||
    (isWireless ? wirelessSetupStatus === 'error' : wiredSetupStatus === 'error')

  const autoTriggeredRef = useRef(false)

  useEffect(() => {
    if (!isUsbDetected) {
      autoTriggeredRef.current = false
      return
    }
    // In wired mode, automatically verify and proceed when PICO 4 Ultra is detected via USB
    if (!isWireless && !isBusy && !isError && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true
      void checkDevices().then((ok) => {
        if (ok) onSuccess()
      })
    }
  }, [isWireless, isUsbDetected, isBusy, isError, checkDevices, onSuccess])

  const handleStartSetup = async () => {
    if (isWireless) {
      const ok = await setupWireless()
      if (ok) onSuccess()
    } else {
      const ok = await checkDevices()
      if (ok) onSuccess()
    }
  }

  const handleConnectManual = async () => {
    const ok = await connectManual()
    if (ok) onSuccess()
  }

  // Filter steps for wired mode (only first 3 steps), and reflect live USB detection when idle
  const baseSteps = isWireless
    ? setupSteps
    : setupSteps.filter((s) => s.id === 'usb' || s.id === 'authorized' || s.id === 'pico')

  const displaySteps = baseSteps.map((s) => {
    if (
      isUsbDetected &&
      s.state === 'idle' &&
      (s.id === 'usb' || s.id === 'authorized' || s.id === 'pico')
    ) {
      return { ...s, state: 'ok' as const }
    }
    return s
  })

  return (
    <div className='flex-1 flex flex-col justify-between px-5 pt-3.5 pb-2 animate-fadeIn overflow-y-auto custom-scrollbar'>
      <div>
        <StepIndicator currentStep='prepare' />

        <div className='mt-4 mb-5 text-center'>
          <h2 className='text-lg font-bold text-[var(--app-text)]'>
            {isWireless ? t('prepare_wireless_title') : t('prepare_wired_title')}
          </h2>
          <p className='mt-1 text-xs text-[var(--app-text-muted)]'>
            {isWireless ? t('prepare_wireless_desc') : t('prepare_wired_desc')}
          </p>
        </div>

        {/* Checklist */}
        <div className='mb-4'>
          <SetupChecklist steps={displaySteps} />
        </div>

        {/* Error Card */}
        {isError && (
          <div className='mb-4'>
            <ErrorCard
              error={connectionError}
              fallbackMessage={isWireless ? t('wireless_status_error') : t('wired_status_error')}
            />
          </div>
        )}

        {/* Manual IP Link for wireless */}
        {isWireless && (
          <div className='text-center my-2'>
            <button
              type='button'
              onClick={() => void handleConnectManual()}
              disabled={isBusy}
              className='text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)] underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
            >
              {t('btn_connect_manual')}
            </button>
          </div>
        )}
      </div>

      <div className='flex flex-col gap-2 pb-6 pt-2'>
        <Button onClick={handleStartSetup} variant='Primary' disabled={isBusy} fullWidth>
          {isBusy
            ? isWireless
              ? t('wireless_status_loading')
              : t('wired_status_loading')
            : isError
              ? t('btn_try_again')
              : isWireless
                ? t('btn_setup_wireless')
                : t('btn_check_devices')}
        </Button>

        <button
          type='button'
          onClick={onBack}
          disabled={isBusy}
          className='text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)] py-2 text-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
        >
          {t('btn_back')}
        </button>
      </div>
    </div>
  )
}
