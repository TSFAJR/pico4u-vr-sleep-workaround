export type SetupStep = 'usb' | 'authorized' | 'pico' | 'wifi' | 'wireless'
export type StepState = 'idle' | 'running' | 'ok' | 'failed' | 'skipped'

export interface SetupProgressPayload {
  step: SetupStep
  state: StepState
  detail?: string | null
}

export interface SetupStepItem {
  id: SetupStep
  state: StepState
  detail?: string | null
}

export const INITIAL_SETUP_STEPS: SetupStepItem[] = [
  { id: 'usb', state: 'idle' },
  { id: 'authorized', state: 'idle' },
  { id: 'pico', state: 'idle' },
  { id: 'wifi', state: 'idle' },
  { id: 'wireless', state: 'idle' },
]

export function updateSetupSteps(
  steps: SetupStepItem[],
  progress: SetupProgressPayload,
): SetupStepItem[] {
  return steps.map((item) => {
    if (item.id === progress.step) {
      return {
        ...item,
        state: progress.state,
        detail: progress.detail ?? null,
      }
    }
    return item
  })
}
