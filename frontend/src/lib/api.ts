import { invoke } from '@tauri-apps/api/core'
import { serialQueue, withTimeout } from './async'
import type { AppConfig, ConnectionMode, ConnectionStatus, SetupOutcome } from '../types'

const saveQueue = serialQueue()
const reads = new Map<string, Promise<unknown>>()
const readCommands = new Set(['get_config', 'check_connection_status', 'get_running'])
function call<T>(command: string, args: Record<string, unknown>, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const key = `${command}:${JSON.stringify(args)}`
  let request: Promise<T>
  if (readCommands.has(command)) {
    request = reads.get(key) as Promise<T>
    if (!request) {
      request = invoke<T>(command, args).finally(() => reads.delete(key))
      reads.set(key, request)
    }
  } else if (command === 'save_config_cmd') {
    request = saveQueue(() => invoke<T>(command, args), signal)
  } else {
    request = invoke<T>(command, args)
  }
  return withTimeout(request, 30000, signal)
}
export const api = {
  config: (signal: AbortSignal) => call<AppConfig>('get_config', {}, signal),
  save: (config: AppConfig, signal: AbortSignal) =>
    call<void>('save_config_cmd', { config }, signal),
  status: (mode: ConnectionMode | null, ip: string, signal: AbortSignal) =>
    call<ConnectionStatus>('check_connection_status', { mode, ip }, signal),
  connect: async (mode: ConnectionMode, ip: string, signal: AbortSignal) => {
    const cancel = () => {
      void invoke('cancel_adb_connection').catch(() => {})
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      return await call<ConnectionMode>('try_auto_connect', { mode, ip }, signal)
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  },
  setup: async (signal: AbortSignal) => {
    const cancel = () => {
      void invoke('cancel_adb_connection').catch(() => {})
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      return await call<SetupOutcome>('setup_wireless', {}, signal)
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  },
  running: (signal: AbortSignal) => call<boolean>('get_running', {}, signal),
  start: (mode: ConnectionMode, signal: AbortSignal) =>
    call<void>('start_keep_awake', { mode }, signal),
  stop: (signal: AbortSignal) => call<void>('stop_keep_awake', {}, signal),
  debug: (enabled: boolean, signal: AbortSignal) =>
    call<void>('set_debug_mode', { enabled }, signal),
}
