import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useAppDialog } from '../../hooks/useAppDialog'
export function AppDialog({ dialog }: { dialog: ReturnType<typeof useAppDialog> }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const id = useId()
  const request = dialog.request
  useEffect(() => {
    if (!request) return
    const previous = document.activeElement as HTMLElement | null
    setValue(request.defaultValue ?? '')
    ref.current?.showModal()
    if (request.kind === 'input') {
      input.current?.focus()
      input.current?.select()
    } else cancel.current?.focus()
    return () => {
      ref.current?.close()
      previous?.focus()
    }
  }, [request])
  return (
    <dialog
      className='app-dialog'
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={(e) => {
        e.preventDefault()
        dialog.finish(null)
      }}
    >
      {request && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            dialog.finish(request.kind === 'input' ? value.trim() : 'confirmed')
          }}
        >
          <div className='modal-header'>
            <h2 id={`${id}-title`}>{request.title}</h2>
            <button type='button' onClick={() => dialog.finish(null)} aria-label={t('close')}>
              ×
            </button>
          </div>
          <div className='app-dialog-body'>
            <p id={`${id}-message`}>{request.message}</p>
            {request.kind === 'input' && (
              <input
                ref={input}
                aria-label={request.message}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
                autoComplete='off'
              />
            )}
          </div>
          <div className='app-dialog-actions'>
            <button
              ref={cancel}
              type='button'
              className='action-button secondary'
              onClick={() => dialog.finish(null)}
            >
              {t('cancel')}
            </button>
            <button
              type='submit'
              className='action-button primary'
              disabled={request.kind === 'input' && !value.trim()}
            >
              {request.confirmText}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
