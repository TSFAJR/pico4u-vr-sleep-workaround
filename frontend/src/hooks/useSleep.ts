import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { SleepStatus } from '../types'
export function useSleep() {
  const [status, setStatus] = useState<SleepStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(false)
  const revision = useRef(0)
  const accept = useCallback((s: SleepStatus) => {
    if (alive.current && s.revision >= revision.current) {
      revision.current = s.revision
      setStatus(s)
    }
  }, [])
  useEffect(() => {
    alive.current = true
    const refresh = () => {
      void invoke<SleepStatus>('get_sleep_status')
        .then(accept)
        .catch((e) => {
          if (alive.current) setError(String(e))
        })
    }
    refresh()
    const stop = listen<SleepStatus>('sleep-status', (e) => accept(e.payload)).catch(() => () => {})
    const timer = setInterval(refresh, 2000)
    return () => {
      alive.current = false
      clearInterval(timer)
      void stop.then((f) => f())
    }
  }, [accept])
  const command = async (name: string, args: Record<string, unknown> = {}) => {
    setError(null)
    try {
      await invoke(name, args)
      accept(await invoke<SleepStatus>('get_sleep_status'))
    } catch (e) {
      if (alive.current) setError(String(e))
    }
  }
  return {
    status,
    error,
    enter: () => command('enter_sleep'),
    exit: () => command('exit_sleep'),
    monitor: (enabled: boolean) => command('set_sleep_monitoring', { enabled }),
    calibrate: (enabled: boolean) => command('calibrate_sleep', { enabled }),
  }
}
