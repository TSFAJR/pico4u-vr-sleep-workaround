import { useAppContext } from '../../context/AppContext'
import type { ConnectionMode } from '../../types'
import { UsbIcon } from './UsbIcon'

interface ConnectionChipProps {
  mode: ConnectionMode | null
  ip?: string
  connected: boolean
}

export function ConnectionChip({ mode, ip, connected }: ConnectionChipProps) {
  const { t, connectionStatus } = useAppContext()

  return (
    <div className={`connection-chip ${connected ? 'connected' : ''}`}>
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          connected ? 'bg-brand' : 'bg-gray-400 dark:bg-gray-600'
        }`}
      />
      {mode === 'wireless' ? (
        <svg
          className='w-3.5 h-3.5 opacity-80'
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
      ) : (
        <UsbIcon className='w-3.5 h-3.5 opacity-80' />
      )}
      <span>
        {connected
          ? `${t(mode === 'wireless' ? 'ui_wireless' : 'ui_wired')}${mode === 'wireless' && ip ? ` · ${ip}` : ''}`
          : t(connectionStatus?.phase === 'reconnecting' ? 'ui_reconnecting' : 'chip_disconnected')}
      </span>
      {connected && <strong>{t('ui_connected')}</strong>}
    </div>
  )
}
