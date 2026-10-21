import { Button, Checkbox } from '@charcoal-ui/react'
import { BrightnessSlider } from './BrightnessSlider'
import { useAppContext } from '../context/AppContext'

export function SteamVrBrightness() {
  const { t, steamvr } = useAppContext()
  const { status, percent, ready, controlError, saveError } = steamvr
  return (
    <section className='flex flex-col gap-3' aria-label={t('steamvr_title')}>
      <h3 className='font-bold text-sm text-[var(--app-text)]'>{t('steamvr_title')}</h3>
      <Checkbox checked={status?.enabled ?? false} disabled={!ready} onChange={steamvr.enable}>
        {t('steamvr_enable')}
      </Checkbox>
      <BrightnessSlider
        label={t('steamvr_percent')}
        value={percent}
        disabled={!ready}
        onChange={steamvr.change}
      />
      <p className='text-xs text-[var(--app-text-muted)]' role='status'>
        {t(`steamvr_phase_${status?.phase ?? 'updating'}`)}
        {status &&
          status.applied_percent !== null &&
          status.enabled &&
          ` · ${t('steamvr_applied', { percent: status.applied_percent })}`}
      </p>
      <Button variant='Default' fullWidth onClick={steamvr.restore}>
        {t('steamvr_restore')}
      </Button>
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
