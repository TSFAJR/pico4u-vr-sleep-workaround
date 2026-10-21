import { useId } from 'react'
import { useTranslation } from 'react-i18next'

export function BrightnessSlider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const id = useId()
  const { t } = useTranslation()
  const buttonClass =
    'h-8 w-8 shrink-0 rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] text-lg text-[var(--app-text)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-brand'
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-3 text-sm'>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className='font-mono shrink-0'>
          {value}%
        </output>
      </div>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          className={buttonClass}
          aria-label={`${label}: ${t('steamvr_decrease')}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <input
          id={id}
          type='range'
          min='0'
          max='100'
          step='1'
          value={value}
          disabled={disabled}
          aria-valuetext={`${value}%`}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className='w-full min-w-0 cursor-pointer accent-brand'
        />
        <button
          type='button'
          className={buttonClass}
          aria-label={`${label}: ${t('steamvr_increase')}`}
          disabled={disabled || value >= 100}
          onClick={() => onChange(Math.min(100, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  )
}
