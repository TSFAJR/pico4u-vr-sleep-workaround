import { useId, type CSSProperties } from 'react'
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
  const buttonClass = 'step-button'
  return (
    <div className='brightness-slider'>
      <div className='brightness-label'>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className='brightness-value'>
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
          className='brightness-range'
          style={{ '--range-fill': `${value}%` } as CSSProperties}
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
