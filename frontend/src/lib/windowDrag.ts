type Point = { x: number; y: number }
type DragIO = {
  cursor: () => Promise<Point>
  position: () => Promise<Point>
  maximized: () => Promise<boolean>
  move: (point: Point) => Promise<void>
  schedule: (callback: () => void) => number
  cancel: (id: number) => void
}

/** All coordinates are physical desktop pixels, including on mixed-DPI monitors. */
export function createWindowDrag(io: DragIO) {
  let active = true
  let frame: number | undefined
  const stop = () => {
    active = false
    if (frame !== undefined) io.cancel(frame)
  }
  const start = async () => {
    try {
      const [origin, cursor, maximized] = await Promise.all([
        io.position(),
        io.cursor(),
        io.maximized(),
      ])
      if (!active || maximized) return stop()
      let last = origin
      const tick = async () => {
        try {
          if (!active) return
          const current = await io.cursor()
          if (!active) return
          const target = {
            x: Math.round(origin.x + current.x - cursor.x),
            y: Math.round(origin.y + current.y - cursor.y),
          }
          if (target.x !== last.x || target.y !== last.y) {
            await io.move(target)
            last = target
          }
          // Only one read/move is in flight; no stale pointer events are queued.
          if (active)
            frame = io.schedule(() => {
              void tick()
            })
        } catch {
          stop()
        }
      }
      if (active)
        frame = io.schedule(() => {
          void tick()
        })
    } catch {
      stop()
    }
  }
  return { start, stop }
}
