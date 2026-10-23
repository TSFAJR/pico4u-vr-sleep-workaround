import type { ReactNode } from 'react'
export function Toggle({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
  children: ReactNode
}) {
  return (
    <label className='toggle-label'>
      <input
        type='checkbox'
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className='toggle-track' aria-hidden='true' />
      <span>{children}</span>
    </label>
  )
}
