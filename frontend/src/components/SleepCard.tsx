import { Glyph } from './ui/Glyph'
import { Toggle } from './ui/Toggle'
import { useAppContext } from '../context/AppContext'
export function SleepCard() {
  const { t, sleep, settings } = useAppContext()
  const s = sleep.status
  const minutes = settings.config?.sleep.minutes ?? 15
  return (
    <section className='dashboard-card sleep-card' aria-label={t('sleep_title')}>
      <div className='card-heading'>
        <span className='feature-badge moon'>
          <Glyph name='moon' />
        </span>
        <div>
          <h2>{t('sleep_title')}</h2>
          <p className='card-description'>{t('ui_sleep_desc')}</p>
        </div>
      </div>
      <div className='action-row sleep-actions'>
        <button
          className='action-button primary'
          onClick={sleep.enter}
          disabled={!s || s.busy || s.sleeping || s.recovery_pending}
        >
          <Glyph name='moon' />
          {t('sleep_enter')}
        </button>
        <button
          className='action-button primary'
          onClick={sleep.exit}
          disabled={!s || (!s.sleeping && !s.recovery_pending && !s.busy)}
        >
          <Glyph name='sun' />
          {t(s?.recovery_pending && !s.sleeping ? 'sleep_retry_restore' : 'sleep_exit')}
        </button>
      </div>
      <div className='monitor-section'>
        <div className='monitor-row'>
          <Toggle checked={s?.monitoring ?? false} onChange={sleep.monitor}>
            {t('sleep_monitor')}
          </Toggle>
          <span className='state-pill' role='status'>
            {t(`sleep_state_${s?.phase ?? 'IDLE'}`)}
          </span>
        </div>
        <p className='card-description monitor-description'>{t('ui_monitor_desc')}</p>
      </div>
      <div className='detection-progress'>
        <span>{t('ui_detection')}</span>
        <progress
          value={s?.monitoring && !s.sleeping ? s.detection.elapsed_secs : 0}
          max={minutes * 60}
          aria-label={t('ui_detection')}
        />
        <span>
          {s?.monitoring && !s.sleeping
            ? `${Math.min(100, Math.floor((s.detection.elapsed_secs / (minutes * 60)) * 100))}%`
            : '--'}
        </span>
      </div>
      {s?.monitoring && !s.sleeping && (
        <>
          <p>{t('sleep_progress', { seconds: s.detection.elapsed_secs, total: minutes * 60 })}</p>
          {s.cooldown_secs > 0 && <p>{t('sleep_cooldown_left', { seconds: s.cooldown_secs })}</p>}
          {s.pending_secs > 0 && <p>{t('sleep_confirm_left', { seconds: s.pending_secs })}</p>}
        </>
      )}
      {s?.sleeping && (
        <p>
          {t('sleep_applied', {
            physical: t(s.physical_applied ? 'sleep_ok' : 'sleep_not_applied'),
            software: t(s.software_applied ? 'sleep_ok' : 'sleep_not_applied'),
          })}
        </p>
      )}
      {s?.fallback_restore && (s.sleeping || s.recovery_pending) && (
        <p className='text-[var(--app-text-muted)]'>{t('sleep_fallback_note')}</p>
      )}
      {s?.monitoring && s.detection.valid && (
        <div className='sleep-capability-notes'>
          {settings.config?.sleep.controllers && !s.detection.controllers_available && (
            <>
              <p>{t('sleep_controller_unavailable')}</p>
              <p className='sleep-desktop-note'>{t('sleep_desktop_note')}</p>
            </>
          )}
          {!s.detection.presence_available && <p>{t('sleep_presence_unavailable')}</p>}
        </div>
      )}
      {(s?.error || sleep.error) && (
        <div role='alert' className='text-red-600 dark:text-red-300 break-words'>
          <p>{t(`sleep_error_${s?.error?.code}`, { defaultValue: t('sleep_error_generic') })}</p>
          <details>
            <summary>{t('sleep_details')}</summary>
            <p className='select-text'>{sleep.error ?? s?.error?.detail}</p>
          </details>
        </div>
      )}
    </section>
  )
}
