import { describe, it, expect, vi } from 'vitest'
import { createWindowDrag } from './windowDrag'

function harness() {
  let cursor = { x: -1200, y: 200 }
  let frame: (() => void) | undefined
  const move = vi.fn(async (_p: { x: number; y: number }) => {})
  const io = {
    cursor: vi.fn(async () => ({ ...cursor })),
    position: async () => ({ x: -1400, y: 100 }),
    maximized: async () => false,
    move,
    schedule: (fn: () => void) => {
      frame = fn
      return 1
    },
    cancel: () => {
      frame = undefined
    },
  }
  const drag = createWindowDrag(io)
  return {
    drag,
    io,
    move,
    setCursor: (x: number, y: number) => {
      cursor = { x, y }
    },
    tick: async () => {
      const fn = frame
      frame = undefined
      fn?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}

describe('desktop window drag', () => {
  it('moves exactly in physical pixels and does not feed back when the window moves', async () => {
    const h = harness()
    await h.drag.start()
    h.setCursor(-1120, 240)
    await h.tick()
    expect(h.move).toHaveBeenLastCalledWith({ x: -1320, y: 140 })
    for (let i = 0; i < 30; i++) await h.tick()
    expect(h.move).toHaveBeenCalledTimes(1)
    h.setCursor(-1200, 200)
    await h.tick()
    expect(h.move).toHaveBeenLastCalledWith({ x: -1400, y: 100 })
    h.drag.stop()
    h.setCursor(2000, 800)
    await h.tick()
    expect(h.move).toHaveBeenCalledTimes(2)
  })
  it('discards a cursor read that finishes after release', async () => {
    const h = harness()
    await h.drag.start()
    let resolve!: (p: { x: number; y: number }) => void
    h.io.cursor.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    await h.tick()
    h.drag.stop()
    resolve({ x: 900, y: 900 })
    await h.tick()
    expect(h.move).not.toHaveBeenCalled()
  })
  it('does not overlap moves or queue stale movement', async () => {
    const h = harness()
    await h.drag.start()
    let resolve!: () => void
    h.move.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r
        }),
    )
    h.setCursor(-1100, 220)
    await h.tick()
    h.setCursor(-1000, 250)
    await h.tick()
    expect(h.move).toHaveBeenCalledTimes(1)
    resolve()
    await new Promise((r) => setTimeout(r, 0))
    await h.tick()
    expect(h.move).toHaveBeenLastCalledWith({ x: -1200, y: 150 })
    h.drag.stop()
  })
  it('cancels pending initialization', async () => {
    const h = harness()
    const start = h.drag.start()
    h.drag.stop()
    await start
    h.setCursor(0, 0)
    await h.tick()
    expect(h.move).not.toHaveBeenCalled()
  })
})
