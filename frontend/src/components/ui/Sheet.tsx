import { useEffect, useRef, useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
export function Sheet({
  title,
  isOpen,
  onClose,
  children,
}: {
  title: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const id = useId()
  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]',
        ) ?? [],
      ).filter((n) => n.getClientRects().length)
      const first = nodes[0],
        last = nodes[nodes.length - 1]
      if (!first) {
        event.preventDefault()
        return
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === ref.current)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [isOpen])
  if (!isOpen) return null
  return (
    <div className='modal-backdrop'>
      <div
        className='app-modal'
        ref={ref}
        tabIndex={-1}
        role='dialog'
        aria-modal='true'
        aria-labelledby={id}
      >
        <div className='modal-header'>
          <h2 id={id}>{title}</h2>
          <button onClick={onClose} aria-label={t('close')}>
            ×
          </button>
        </div>
        <div className='modal-content custom-scrollbar'>{children}</div>
      </div>
    </div>
  )
}
