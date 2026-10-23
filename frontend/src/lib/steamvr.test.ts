import { defaultSleepConfig } from '../types'
import { afterEach, expect, it, vi } from 'vitest'
import { latestThrottle } from './steamvr'
import { configWriter } from './settings'

afterEach(() => vi.useRealTimers())
it('coalesces continuous slider movement every 50ms instead of waiting for release', () => {
  vi.useFakeTimers()
  const send = vi.fn()
  const throttle = latestThrottle(send)
  for (let i = 0; i < 50; i++) throttle.push(i)
  vi.advanceTimersByTime(50)
  expect(send).toHaveBeenCalledExactlyOnceWith(49)
  throttle.push(10)
  vi.advanceTimersByTime(50)
  expect(send).toHaveBeenLastCalledWith(10)
})
it('restore cancels pending darkening', () => {
  vi.useFakeTimers()
  const send = vi.fn()
  const throttle = latestThrottle(send)
  throttle.push(0)
  throttle.cancel()
  vi.advanceTimersByTime(500)
  expect(send).not.toHaveBeenCalled()
})
it('brightness saves preserve concurrent ADB settings and can recover after disk failure', async () => {
  const initial = {
    sleep: defaultSleepConfig,
    keep_awake_interval_secs: 3,
    ip_address: '192.168.1.4',
    last_connection_mode: 'wireless' as const,
    steamvr_brightness_percent: 100,
  }
  const save = vi.fn().mockResolvedValue(undefined)
  const update = configWriter(initial, save)
  await Promise.all([
    update({ steamvr_brightness_percent: 10 }),
    update({ sleep: { ...defaultSleepConfig, minutes: 20 } }),
  ])
  expect(save.mock.lastCall?.[0]).toEqual({
    ...initial,
    steamvr_brightness_percent: 10,
    sleep: { ...defaultSleepConfig, minutes: 20 },
  })
  save.mockRejectedValueOnce(new Error('disk full'))
  await expect(update({ steamvr_brightness_percent: 0 })).rejects.toThrow('disk full')
  await expect(update({ steamvr_brightness_percent: 100 })).resolves.toMatchObject({
    steamvr_brightness_percent: 100,
  })
})
