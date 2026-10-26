import { useAppContext } from '../../context/AppContext'
import { Glyph } from '../ui/Glyph'
import { ErrorCard } from '../ErrorCard'
import headset from '../../assets/headset.png'
export function OperateScreen() {
  const {
    t,
    isConnected,
    isRunning,
    runtime,
    isConnecting,
    settings,
    toggleKeepAwake,
    connectionMode,
    wirelessSetupStatus,
    setupSteps,
    runtimeError,
    connectionStatus,
    retryAutoConnect,
  } = useAppContext()
  const busy = runtime.busy || isConnecting || settings.isSaving || !runtime.ready
  return (
    <section className='dashboard-card keepawake-card' aria-label={t('ui_keepawake')}>
      <div className='headset-orbit'>
        <img src={headset} alt='' />
        <span className='headset-rays' aria-hidden='true'>
          ◜
        </span>
      </div>
      <div className='keepawake-content'>
        <div className='keepawake-heading'>
          <div>
            <h2>{t('ui_keepawake')}</h2>
            <p className='card-description'>{t('ui_keepawake_desc')}</p>
          </div>
          {isConnected && connectionMode === 'wireless' && wirelessSetupStatus === 'success' && (
            <div className='connection-success'>
              <Glyph name='check' />
              <span>
                {t(
                  setupSteps[0]?.detail === 'already_connected'
                    ? 'setup_already_wireless'
                    : 'wireless_status_success',
                )}
              </span>
            </div>
          )}
        </div>
        <div className='action-row hero-actions'>
          <button
            className='action-button primary'
            disabled={busy || !isConnected || isRunning}
            onClick={() => {
              if (!isRunning) void toggleKeepAwake()
            }}
          >
            <Glyph name='play' />
            {t('ui_start')}
          </button>
          <button
            className='action-button primary'
            disabled={runtime.busy || !runtime.ready || !isRunning}
            onClick={() => {
              if (isRunning) void toggleKeepAwake()
            }}
          >
            <Glyph name='stop' />
            {t('ui_stop')}
          </button>
        </div>
        <p className='running-status' role='status'>
          <span className={`status-dot ${isRunning ? 'active' : ''}`} />
          {t('ui_current_status')}{' '}
          <strong>
            {t(
              isRunning
                ? isConnected
                  ? 'status_running'
                  : 'ui_keepawake_reconnecting'
                : 'status_stopped',
            )}
          </strong>
        </p>
        {isRunning && !isConnected && connectionStatus?.phase === 'disconnected' && (
          <div>
            <ErrorCard error={connectionStatus.error ?? null} />
            <button
              className='action-button primary'
              disabled={isConnecting}
              onClick={() => void retryAutoConnect()}
            >
              {t('ui_retry_connection')}
            </button>
          </div>
        )}
        {runtimeError && <ErrorCard error={runtimeError} />}
      </div>
    </section>
  )
}
