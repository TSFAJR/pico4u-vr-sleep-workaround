import { Button, TextField, DropdownSelector, DropdownMenuItem, Checkbox } from '@charcoal-ui/react'
import { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { normalizeLanguage } from '../lib/language'
import { SleepSettings } from './SleepSettings'
import { defaultSleepConfig } from '../types'

export function Settings({ onClose }: { onClose?: () => void }) {
  const {
    t,
    i18n,
    changeLanguage,
    settings,
    keepAwakeInterval,
    updateKeepAwakeInterval,
    isDebug,
    toggleDebugMode,
    theme,
    setTheme,
  } = useAppContext()

  const [pendingLanguage, setPendingLanguage] = useState(normalizeLanguage(i18n.language))
  const [pendingTheme, setPendingTheme] = useState(theme)
  const [pendingSleep, setPendingSleep] = useState(settings.config?.sleep ?? defaultSleepConfig)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingInterval, setPendingInterval] = useState(keepAwakeInterval)
  const [pendingDebug, setPendingDebug] = useState(isDebug)

  const handleApply = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await settings.update({ sleep: pendingSleep })
      if (pendingLanguage !== i18n.language) {
        changeLanguage(pendingLanguage)
      }
      if (pendingTheme !== theme) {
        setTheme(pendingTheme as any)
      }
      if (pendingInterval !== keepAwakeInterval) {
        await updateKeepAwakeInterval(pendingInterval)
      }
      if (pendingDebug !== isDebug) {
        await toggleDebugMode(pendingDebug)
      }
      onClose?.()
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    onClose?.()
  }

  return (
    <div className='settings-layout'>
      <div className='settings-fields'>
        <h3 className='settings-group-title'>{t('ui_general')}</h3>
        <div>
          <DropdownSelector
            label={t('language_label')}
            value={pendingLanguage}
            onChange={(val) => setPendingLanguage(normalizeLanguage(val))}
            className='w-full'
            showLabel
          >
            <DropdownMenuItem value='zh-CN'>简体中文</DropdownMenuItem>
            <DropdownMenuItem value='ja'>日本語</DropdownMenuItem>
            <DropdownMenuItem value='en'>English</DropdownMenuItem>
          </DropdownSelector>
        </div>

        <div>
          <DropdownSelector
            label={t('theme_label')}
            value={pendingTheme}
            onChange={(val) => setPendingTheme(val as any)}
            className='w-full'
            showLabel
          >
            <DropdownMenuItem value='light'>{t('theme_light')}</DropdownMenuItem>
            <DropdownMenuItem value='dark'>{t('theme_dark')}</DropdownMenuItem>
            <DropdownMenuItem value='system'>{t('theme_system')}</DropdownMenuItem>
          </DropdownSelector>
        </div>

        <div>
          <TextField
            label={t('keep_awake_interval_label')}
            type='number'
            value={String(pendingInterval)}
            onChange={(val) => setPendingInterval(Number(val))}
            assistiveText={t('keep_awake_interval_note')}
            className='w-full text-left'
            showLabel
          />
        </div>

        <div className='mt-0.5 text-sm font-bold text-[var(--app-text)]'>
          <Checkbox checked={pendingDebug} onChange={setPendingDebug}>
            {t('debug_mode')}
          </Checkbox>
        </div>
        <SleepSettings value={pendingSleep} onChange={setPendingSleep} />
      </div>

      <div className='settings-footer'>
        {saveError && (
          <p role='alert' className='text-xs text-red-600 break-words'>
            {t('sleep_invalid_settings')}: {saveError}
          </p>
        )}
        <Button onClick={handleApply} disabled={saving} variant='Primary' fullWidth>
          {t('btn_apply_changes')}
        </Button>
        <Button onClick={handleCancel} variant='Default' fullWidth>
          {t('cancel')}
        </Button>
      </div>
    </div>
  )
}
