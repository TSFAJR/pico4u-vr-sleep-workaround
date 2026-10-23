import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, type PointerEvent } from 'react'
import { Icon } from '@charcoal-ui/react'
import {
  getCurrentWindow,
  currentMonitor,
  cursorPosition,
  LogicalSize,
  PhysicalPosition,
} from '@tauri-apps/api/window'
import packageJson from '../../../package.json'
import { useAppContext } from '../../context/AppContext'
import { ConnectionChip } from './ConnectionChip'
import logo from '../../assets/logo.png'
import { createWindowDrag } from '../../lib/windowDrag'
export function AppHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t, connectionMode, deviceIp, isConnected, dialog } = useAppContext()
  const version = `v${packageJson.version}`
  const title = `${t('ui_title')} ${version}`
  const control = (action: 'minimize' | 'toggleMaximize') => {
    try {
      void getCurrentWindow()
        [action]()
        .catch(() => {})
    } catch {
      /* Browser preview */
    }
  }
  const exitPending = useRef(false)
  const requestExit = async () => {
    if (exitPending.current) return
    exitPending.current = true
    try {
      const [running, sleep, vr] = await Promise.all([
        invoke<boolean>('get_running'),
        invoke<{
          monitoring: boolean
          sleeping: boolean
          busy: boolean
          recovery_pending: boolean
          reason: string
        }>('get_sleep_status'),
        invoke<{ enabled: boolean }>('get_steamvr_status'),
      ])
      if (
        running ||
        sleep.monitoring ||
        sleep.sleeping ||
        sleep.busy ||
        sleep.recovery_pending ||
        sleep.reason === 'calibrating' ||
        vr.enabled
      ) {
        if (
          !(await dialog.ask({
            kind: 'confirm',
            title: t('ui_exit_title'),
            message: t('ui_exit_warning'),
            confirmText: t('ui_exit_confirm'),
          }))
        )
          return
      }
      await invoke('exit_app')
    } catch {
      if (
        await dialog.ask({
          kind: 'confirm',
          title: t('ui_exit_title'),
          message: t('ui_exit_unknown'),
          confirmText: t('ui_exit_confirm'),
        })
      )
        await invoke('exit_app').catch(() => {})
    } finally {
      exitPending.current = false
    }
  }
  const exitHandler = useRef(requestExit)
  exitHandler.current = requestExit
  useEffect(() => {
    const listener = getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault()
        void exitHandler.current()
      })
      .catch(() => () => {})
    return () => {
      void listener.then((stop) => stop())
    }
  }, [])
  // OS desktop coordinates stay stable when the WebView moves under the pointer.
  const dragState = useRef<ReturnType<typeof createWindowDrag> | null>(null)
  const endDrag = () => {
    dragState.current?.stop()
    dragState.current = null
  }
  useEffect(() => {
    window.addEventListener('blur', endDrag)
    return () => {
      window.removeEventListener('blur', endDrag)
      endDrag()
    }
  }, [])
  const pointerDrag = (event: PointerEvent<HTMLElement>) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      event.target.closest('button, input, a, [role="button"]')
    )
      return
    event.preventDefault()
    endDrag()
    event.currentTarget.setPointerCapture(event.pointerId)
    const win = getCurrentWindow()
    const drag = createWindowDrag({
      cursor: cursorPosition,
      position: () => win.outerPosition(),
      maximized: () => win.isMaximized(),
      move: (p) => win.setPosition(new PhysicalPosition(p.x, p.y)),
      schedule: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    })
    dragState.current = drag
    void drag.start()
  }
  useEffect(() => {
    document.title = title
    try {
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => {})
    } catch {
      /* Browser preview */
    }
  }, [title])
  useEffect(() => {
    // Fit the initial window to the monitor's usable area, accounting for DPI.
    void (async () => {
      const monitor = await currentMonitor()
      if (!monitor) return
      const win = getCurrentWindow()
      const size = await win.outerSize()
      const area = monitor.workArea
      const width = Math.min(
        size.width / monitor.scaleFactor,
        area.size.width / monitor.scaleFactor - 24,
      )
      const height = Math.min(
        size.height / monitor.scaleFactor,
        area.size.height / monitor.scaleFactor - 24,
      )
      if (
        size.width > area.size.width - 24 * monitor.scaleFactor ||
        size.height > area.size.height - 24 * monitor.scaleFactor
      ) {
        await win.setSize(new LogicalSize(Math.max(640, width), Math.max(560, height)))
        const fitted = await win.outerSize()
        await win.setPosition(
          new PhysicalPosition(
            area.position.x + Math.max(0, (area.size.width - fitted.width) / 2),
            area.position.y + Math.max(0, (area.size.height - fitted.height) / 2),
          ),
        )
      }
    })().catch(() => {
      /* Browser preview or monitor unavailable. */
    })
  }, [])
  return (
    <header
      className='app-header'

      onPointerDown={pointerDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={(e) => {
        if (e.target instanceof Element && !e.target.closest('button')) control('toggleMaximize')
      }}
    >
      <div className='titlebar'>
        <div className='titlebar-drag' />
        <button aria-label={t('ui_minimize')} onClick={() => control('minimize')}>
          −
        </button>
        <button aria-label={t('ui_maximize')} onClick={() => control('toggleMaximize')}>
          □
        </button>
        <button className='window-close' aria-label={t('close')} onClick={() => void requestExit()}>
          ×
        </button>
      </div>
      <div className='brand-row'>
        <img className='brand-logo' src={logo} alt='' draggable={false} />
        <div className='brand-copy'>
          <h1>
            {t('ui_title')} <span>{version}</span>
          </h1>
          <p>PICO 4 Ultra / VD / SteamVR</p>
        </div>
        <ConnectionChip mode={connectionMode} ip={deviceIp} connected={isConnected} />
        <button
          className='settings-button'
          onClick={onOpenSettings}
          aria-label={t('settings_title')}
        >
          <Icon name='24/Settings' />
        </button>
      </div>
    </header>
  )
}
