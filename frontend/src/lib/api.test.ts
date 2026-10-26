import { afterEach, describe, expect, it, vi } from 'vitest'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
afterEach(() => {
  vi.resetAllMocks()
  vi.resetModules()
})
describe('ADB command isolation', () => {
  it('a stalled connection does not block status, stop or config reads', async () => {
    let finish!: () => void
    invoke.mockImplementation((command: string) =>
      command === 'try_auto_connect'
        ? new Promise<void>((resolve) => {
            finish = resolve
          })
        : Promise.resolve(false),
    )
    const { api } = await import('./api')
    const signal = new AbortController().signal
    const connect = api.connect('wireless', '192.168.1.2', signal)
    await api.stop(signal)
    await api.running(signal)
    await api.config(signal)
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      'try_auto_connect',
      'stop_keep_awake',
      'get_running',
      'get_config',
    ])
    finish()
    await connect
  })
  it('coalesces identical slow reads instead of building a polling backlog', async () => {
    let finish!: (value: boolean) => void
    invoke.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        }),
    )
    const { api } = await import('./api')
    const signal = new AbortController().signal
    const first = api.running(signal),
      second = api.running(signal)
    expect(invoke).toHaveBeenCalledTimes(1)
    finish(true)
    expect(await first).toBe(true)
    expect(await second).toBe(true)
  })
  it('cancels the backend when a connection dialog is dismissed', async () => {
    let finish!: () => void
    invoke.mockImplementation((command: string) =>
      command === 'try_auto_connect'
        ? new Promise<void>((resolve) => {
            finish = resolve
          })
        : Promise.resolve(),
    )
    const { api } = await import('./api')
    const controller = new AbortController()
    const waiting = expect(
      api.connect('wireless', '192.168.1.2', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await waiting
    expect(invoke).toHaveBeenCalledWith('cancel_adb_connection')
    finish()
  })
})
