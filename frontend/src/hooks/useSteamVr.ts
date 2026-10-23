import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { latestThrottle, type SteamVrStatus } from '../lib/steamvr'
import type { useSettings } from './useSettings'

export function useSteamVr(settings: ReturnType<typeof useSettings>, sleeping = false) {
  const [status, setStatus] = useState<SteamVrStatus | null>(null)
  const [percent, setPercent] = useState(100)
  const [controlError, setControlError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const request = useRef(0)
  const alive = useRef(false)
  const initialized = useRef(false)
  const actions = useRef<(value: number) => void>(() => {})
  const throttle = useRef<ReturnType<typeof latestThrottle<number>> | null>(null)
  if (!throttle.current) throttle.current = latestThrottle((value) => actions.current(value))

  const accept = useCallback((next: SteamVrStatus) => {
    if (!alive.current || next.revision < request.current) return
    request.current = Math.max(request.current, next.revision)
    setStatus(next)
    if (!throttle.current?.hasPending()) setPercent(next.percent)
  }, [])

  useEffect(() => {
    alive.current = true
    const refresh = () => {
      void invoke<SteamVrStatus>('get_steamvr_status')
        .then(accept)
        .catch((error) => {
          if (alive.current) setControlError(String(error))
        })
    }
    const unlisten = listen<SteamVrStatus>('steamvr-brightness-status', (event) =>
      accept(event.payload),
    ).catch(() => () => {})
    refresh()
    const poll = setInterval(refresh, 2000)
    return () => {
      alive.current = false
      clearInterval(poll)
      throttle.current?.cancel()
      void unlisten.then((stop) => stop())
    }
  }, [accept])

  useEffect(() => {
    if (settings.config && !initialized.current) {
      initialized.current = true
      setPercent(settings.config.steamvr_brightness_percent)
    }
  }, [settings.config])

  const send = (command: string, args: Record<string, unknown> = {}) => {
    const id = Math.max(request.current + 1, Date.now() * 1000)
    request.current = id
    setControlError(null)
    void invoke<SteamVrStatus>(command, { ...args, request: id })
      .then(accept)
      .catch((error) => {
        if (alive.current && request.current === id) setControlError(String(error))
      })
  }
  const save = (value: number) => {
    if (sleeping) return
    void settings
      .update({ steamvr_brightness_percent: value })
      .then(() => {
        if (alive.current) setSaveError(null)
      })
      .catch((error) => {
        if (alive.current) setSaveError(String(error))
      })
  }
  actions.current = (value) => {
    send('set_steamvr_percent', { percent: value })
    save(value)
  }
  const change = (value: number) => {
    const checked = Math.min(100, Math.max(0, Math.round(value)))
    setPercent(checked)
    throttle.current!.push(checked)
  }
  const enable = (enabled: boolean) => {
    throttle.current!.cancel()
    send('set_steamvr_enabled', { enabled, percent })
    save(percent)
  }
  const restore = () => {
    throttle.current!.cancel()
    setPercent(100)
    // Recovery never waits on configuration persistence or the ADB queue.
    send('restore_steamvr')
    save(100)
  }
  return {
    status,
    percent,
    change,
    enable,
    restore,
    retry: () => send('retry_steamvr'),
    saveAgain: () => save(percent),
    saveError,
    controlError,
    ready: settings.config !== null && status !== null,
  }
}
