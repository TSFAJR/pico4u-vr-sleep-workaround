import { useState, useEffect } from 'react'
import { Button } from '@charcoal-ui/react'
import { useAppContext } from '../../context/AppContext'
import { StepIndicator } from '../ui/StepIndicator'
import { ChoiceCard } from '../ui/ChoiceCard'
import { UsbIcon } from '../ui/UsbIcon'
import type { ConnectionMode } from '../../types'

interface ModeSelectScreenProps {
  onNext: (selectedMode: ConnectionMode) => void
  onBack?: () => void
}

export function ModeSelectScreen({ onNext, onBack }: ModeSelectScreenProps) {
  const { t, connectionMode, isConnected } = useAppContext()
  const [selected, setSelected] = useState<ConnectionMode>(connectionMode ?? 'wireless')

  useEffect(() => {
    if (connectionMode) {
      setSelected(connectionMode)
    }
  }, [connectionMode])

  return (
    <div className='flex-1 flex flex-col justify-between px-5 pt-3.5 pb-2 animate-fadeIn'>
      <div>
        <StepIndicator currentStep='mode' />

        <div className='mt-5 mb-6 text-center'>
          <h2 className='text-lg font-bold text-[var(--app-text)]'>{t('mode_select_heading')}</h2>
          <p className='mt-1 text-xs text-[var(--app-text-muted)]'>{t('mode_select_subheading')}</p>
        </div>

        <div className='flex flex-col gap-3.5'>
          {/* Card: Wired */}
          <ChoiceCard
            selected={selected === 'wired'}
            onClick={() => setSelected('wired')}
            icon={<UsbIcon className='w-6 h-6' />}
            title={t('mode_wired')}
            description={t('mode_wired_desc')}
          />

          {/* Card: Wireless */}
          <ChoiceCard
            selected={selected === 'wireless'}
            onClick={() => setSelected('wireless')}
            icon={
              <svg
                className='w-6 h-6'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d='M5 12.55a11 11 0 0 1 14.08 0' />
                <path d='M1.42 9a16 16 0 0 1 21.16 0' />
                <path d='M8.53 16.11a6 6 0 0 1 6.95 0' />
                <line x1='12' y1='20' x2='12.01' y2='20' strokeWidth='3' />
              </svg>
            }
            title={t('mode_wireless')}
            description={t('mode_wireless_desc')}
            badge={t('badge_recommended')}
          />
        </div>
      </div>

      <div className='flex flex-col gap-2 pb-6 pt-4'>
        <Button onClick={() => onNext(selected)} variant='Primary' fullWidth>
          {t('btn_continue')}
        </Button>

        {isConnected && onBack && (
          <button
            type='button'
            onClick={onBack}
            className='text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)] py-2 text-center transition-colors cursor-pointer'
          >
            {t('btn_back')}
          </button>
        )}
      </div>
    </div>
  )
}
