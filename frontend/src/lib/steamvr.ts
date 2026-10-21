export interface SteamVrStatus {
  revision: number
  enabled: boolean
  percent: number
  phase: string
  applied_percent: number | null
  error: { code: string; detail: string } | null
}

// A single latest-value slot, not a promise/request queue. Restoring cancels
// pending darkening; the backend also rejects older request sequence numbers.
export function latestThrottle<T>(send: (value: T) => void, delay = 50) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: T
  return {
    push(value: T) {
      pending = value
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        send(pending)
      }, delay)
    },
    cancel() {
      clearTimeout(timer)
      timer = undefined
    },
    hasPending() {
      return timer !== undefined
    },
  }
}
