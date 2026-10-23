import { SettingHelp } from './ui/SettingHelp'
import type { ReactNode } from 'react'
import { Glyph } from './ui/Glyph'
import { Button, Checkbox, TextField, DropdownSelector, DropdownMenuItem } from '@charcoal-ui/react'
import type { SleepConfig } from '../types'
import { useAppContext } from '../context/AppContext'
import { BrightnessSlider } from './BrightnessSlider'
export function SleepSettings({
  value,
  onChange,
}: {
  value: SleepConfig
  onChange: (value: SleepConfig) => void
}) {
  const { t, sleep } = useAppContext()
  const calibrated = sleep.status?.reason === 'calibrated'
  const calibrationError = sleep.status?.reason === 'calibrating' ? sleep.status.error : null
  const calibrating = sleep.status?.reason === 'calibrating' && !calibrationError
  const help = (label: string, text: string, child: ReactNode) => (
    <SettingHelp label={t('sleep_help_label', { setting: t(label) })} text={t(text)}>
      {child}
    </SettingHelp>
  )
  const number = (key: keyof SleepConfig, label: string) => (
    <TextField
      key={key}
      type='number'
      label={t(label)}
      value={String(value[key])}
      onChange={(s) => onChange({ ...value, [key]: Number(s) })}
      showLabel
      className='w-full'
    />
  )
  const check = (key: 'controllers' | 'rotation' | 'confirmation', label: string) => (
    <Checkbox key={key} checked={value[key]} onChange={(v) => onChange({ ...value, [key]: v })}>
      {t(label)}
    </Checkbox>
  )
  return (
    <div className='sleep-settings-grid'>
      <section className='settings-group'>
        <h3 className='font-bold'>{t('sleep_detection_settings')}</h3>
        <Checkbox checked={sleep.status?.monitoring ?? false} onChange={sleep.monitor}>
          {t('sleep_monitor')}
        </Checkbox>
        <p className='text-xs text-[var(--app-text-muted)]'>{t('sleep_immediate')}</p>
        {number('minutes', 'sleep_minutes')}
        <DropdownSelector
          label={t('sleep_sensitivity')}
          value={String(value.sensitivity)}
          onChange={(v) => onChange({ ...value, sensitivity: Number(v) })}
          showLabel
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <DropdownMenuItem key={n} value={String(n)}>
              {t(`sleep_sensitivity_${n}`)}
            </DropdownMenuItem>
          ))}
        </DropdownSelector>
        {help(
          'sleep_controllers',
          'sleep_controllers_help',
          check('controllers', 'sleep_controllers'),
        )}
        {help('sleep_rotation', 'sleep_rotation_help', check('rotation', 'sleep_rotation'))}
        {help(
          'sleep_confirmation',
          'sleep_confirmation_help',
          check('confirmation', 'sleep_confirmation'),
        )}
        {help(
          'sleep_cooldown',
          'sleep_cooldown_help',
          number('cooldown_minutes', 'sleep_cooldown'),
        )}
        <p className='text-xs'>{t('sleep_calibration_note')}</p>
        <div className='flex gap-2'>
          <Button
            variant='Default'
            onClick={() => sleep.calibrate(true)}
            disabled={sleep.status?.sleeping || sleep.status?.busy || calibrating}
          >
            {t(calibrated ? 'sleep_recalibrate' : 'sleep_calibrate')}
          </Button>
          <Button
            variant='Default'
            onClick={() => sleep.calibrate(false)}
            disabled={sleep.status?.reason !== 'calibrating'}
          >
            {t('cancel')}
          </Button>
        </div>
        <div
          className={calibrated ? 'calibration-success' : 'text-xs'}
          role='status'
          aria-live='polite'
        >
          {calibrationError ? (
            <p className='text-red-600 dark:text-red-300'>
              {t('sleep_error_generic')}: {calibrationError.detail}
            </p>
          ) : calibrated ? (
            <>
              <Glyph name='check' />
              <div>
                <strong>{t('sleep_calibration_complete')}</strong>
                <p>{t('sleep_calibration_saved')}</p>
              </div>
            </>
          ) : calibrating ? (
            t(
              sleep.status!.detection.calibration_progress >= 100
                ? 'sleep_calibration_saving'
                : 'sleep_calibration_progress',
              { percent: sleep.status!.detection.calibration_progress },
            )
          ) : (
            t(
              sleep.status?.reason === 'calibration_cancelled'
                ? 'sleep_calibration_cancelled'
                : 'sleep_calibration_idle',
            )
          )}
        </div>
      </section>
      <section className='settings-group'>
        <h3 className='font-bold'>{t('sleep_brightness_settings')}</h3>
        {help(
          'sleep_physical',
          'sleep_physical_help',
          <BrightnessSlider
            label={t('sleep_physical')}
            value={Math.round(value.physical * 100)}
            onChange={(percent) => onChange({ ...value, physical: percent / 100 })}
          />,
        )}
        {help(
          'sleep_software',
          'sleep_software_help',
          <BrightnessSlider
            label={t('sleep_software')}
            value={value.software_percent}
            onChange={(v) => onChange({ ...value, software_percent: v })}
          />,
        )}
        {help(
          'sleep_enter_seconds',
          'sleep_fade_help',
          number('enter_seconds', 'sleep_enter_seconds'),
        )}
        {help(
          'sleep_exit_seconds',
          'sleep_fade_help',
          number('exit_seconds', 'sleep_exit_seconds'),
        )}
        {help(
          'sleep_restore_physical',
          'sleep_restore_physical_help',
          <BrightnessSlider
            label={t('sleep_restore_physical')}
            value={Math.round(value.restore_physical * 100)}
            onChange={(percent) => onChange({ ...value, restore_physical: percent / 100 })}
          />,
        )}
        {sleep.error && (
          <p role='alert' className='text-xs text-red-600 break-words'>
            {t('sleep_error_generic')}: {sleep.error}
          </p>
        )}
      </section>
    </div>
  )
}
