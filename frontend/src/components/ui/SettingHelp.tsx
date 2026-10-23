import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** Help stays inside the scrolling settings sheet; clicking pins it for VR pointers. */
export function SettingHelp({
  label,
  text,
  children,
}: {
  label: string
  text: string
  children: ReactNode
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hover || focused || pinned
  useEffect(() => {
    if (!open) return
    const close = () => {
      setHover(false)
      setFocused(false)
      setPinned(false)
    }
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
      }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])
  return (
    <div className='setting-help' ref={root} onPointerLeave={() => setHover(false)}>
      <div className='setting-help-control'>{children}</div>
      <button
        type='button'
        className='setting-help-button'
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') setHover(true)
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) setFocused(true)
        }}
        onBlur={() => setFocused(false)}
        onClick={() => {
          setPinned(!pinned)
          setHover(false)
          setFocused(false)
        }}
      >
        <span aria-hidden='true'>ⓘ</span>
      </button>
      {open && (
        <div id={id} className='setting-help-text' role='note'>
          {text}
        </div>
      )}
    </div>
  )
}
