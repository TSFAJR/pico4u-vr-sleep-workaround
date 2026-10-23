import { Button } from '@charcoal-ui/react'
import { Toggle } from './ui/Toggle'
import { Glyph } from './ui/Glyph'
import { BrightnessSlider } from './BrightnessSlider'
import { useAppContext } from '../context/AppContext'

export function SteamVrBrightness() {
  const { t, steamvr } = useAppContext()
  const { status, percent, ready, controlError, saveError } = steamvr
  return (
    <section className='dashboard-card brightness-card' aria-label={t('steamvr_title')}>
      <div className='card-heading'>
        <span className='feature-badge sun'>
          <Glyph name='sun' />
        </span>
        <div>
          <h2>{t('steamvr_title')}</h2>
          <p className='card-description'>{t('ui_brightness_desc')}</p>
        </div>
      </div>
      <Toggle checked={status?.enabled ?? false} disabled={!ready} onChange={steamvr.enable}>
        {t('steamvr_enable')}
      </Toggle>
      <p className='card-description brightness-description'>{t('ui_brightness_note')}</p>
      <BrightnessSlider
        label={t('steamvr_percent')}
        value={percent}
        disabled={!ready}
        onChange={steamvr.change}
      />
      <div className='brightness-footer'>
        <p className='text-xs text-[var(--app-text-muted)]' role='status'>
          {t(`steamvr_phase_${status?.phase ?? 'updating'}`)}
          {status &&
            status.applied_percent !== null &&
            status.enabled &&
            ` · ${t('steamvr_applied', { percent: status.applied_percent })}`}
        </p>
        <button className='restore-link' onClick={steamvr.restore}>
          {t('steamvr_restore')}
        </button>
      </div>
      {(status?.error || controlError) && (
        <div className='text-xs text-red-600 dark:text-red-300 break-words' role='alert'>
          {status?.error && (
            <p>
              {t(`steamvr_error_${status.error.code}`, {
                defaultValue: t('steamvr_error_overlay_failed'),
              })}
            </p>
          )}
          <p className='select-text'>{controlError ?? status?.error?.detail}</p>
          <Button variant='Default' onClick={steamvr.retry}>
            {t('btn_try_again')}
          </Button>
        </div>
      )}
      {saveError && (
        <div role='alert' className='text-xs text-red-600 dark:text-red-300 break-words'>
          <p>
            {t('steamvr_save_error')}: {saveError}
          </p>
          <button type='button' className='underline cursor-pointer' onClick={steamvr.saveAgain}>
            {t('steamvr_save_again')}
          </button>
        </div>
      )}
    </section>
  )
}
