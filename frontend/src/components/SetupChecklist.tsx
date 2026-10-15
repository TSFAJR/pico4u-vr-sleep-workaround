import { useTranslation } from 'react-i18next'
import type { SetupStepItem } from '../lib/setupSteps'

interface SetupChecklistProps {
  steps: SetupStepItem[]
}

export function SetupChecklist({ steps }: SetupChecklistProps) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col gap-1.5 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-xs text-left'>
      {steps.map((item) => {
        const isRunning = item.state === 'running'
        const isOk = item.state === 'ok'
        const isFailed = item.state === 'failed'

        return (
          <div
            key={item.id}
            className='flex items-center justify-between py-1 border-b border-gray-200/50 dark:border-gray-700/50 last:border-0'
          >
            <div className='flex items-center gap-2'>
              {isRunning && (
                <span className='w-3.5 h-3.5 border-2 border-green-600 border-t-transparent rounded-full animate-spin' />
              )}
              {isOk && <span className='text-green-600 font-bold text-sm'>✓</span>}
              {isFailed && <span className='text-red-500 font-bold text-sm'>✕</span>}
              {item.state === 'idle' && (
                <span className='text-gray-400 dark:text-gray-600 text-sm'>○</span>
              )}
              <span
                className={
                  isFailed
                    ? 'text-red-600 dark:text-red-400 font-medium'
                    : isOk
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                }
              >
                {t(`setup_step_${item.id}`)}
              </span>
            </div>
            <span className='text-[11px] font-mono text-gray-500 dark:text-gray-400'>
              {isOk && 'OK'}
              {isRunning && '...'}
              {isFailed && 'NG'}
              {item.state === 'idle' && '-'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
