import { useEffect, useRef, useState } from 'react'
export type DialogRequest = {
  kind: 'confirm' | 'input'
  title: string
  message: string
  confirmText: string
  defaultValue?: string
}
export function useAppDialog() {
  const [request, setRequest] = useState<DialogRequest | null>(null)
  const pending = useRef<((value: string | null) => void) | null>(null)
  useEffect(
    () => () => {
      pending.current?.(null)
      pending.current = null
    },
    [],
  )
  const finish = (value: string | null) => {
    const resolve = pending.current
    pending.current = null
    setRequest(null)
    resolve?.(value)
  }
  const ask = (next: DialogRequest) =>
    new Promise<string | null>((resolve) => {
      pending.current?.(null)
      pending.current = resolve
      setRequest(next)
    })
  return { request, ask, finish }
}
